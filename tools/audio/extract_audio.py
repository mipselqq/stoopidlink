#!/usr/bin/env python3
"""Extract named Alien: Isolation terminal events from Wwise v89 banks.
No game files are modified. Requires ffmpeg and a built vgmstream-cli.
"""

import argparse
import json
import pathlib
import struct
import subprocess


def u32(data, pos=0):
    return struct.unpack_from("<I", data, pos)[0]


def fnv(name):
    value = 2166136261
    for c in name.lower().encode():
        value = ((value * 16777619) ^ c) & 0xFFFFFFFF
    return value


def bank(path):
    chunks = {}
    data = path.read_bytes()
    p = 0
    while p < len(data):
        kind = data[p : p + 4].decode()
        n = u32(data, p + 4)
        chunks[kind] = data[p + 8 : p + 8 + n]
        p += 8 + n
    objs = {}
    data = chunks.get("HIRC", b"\0" * 4)
    p = 4
    for _ in range(u32(data)):
        kind = data[p]
        n = u32(data, p + 1)
        ident = u32(data, p + 5)
        objs[ident] = (kind, data[p + 9 : p + 5 + n])
        p += 5 + n
    media = {}
    idx = chunks.get("DIDX", b"")
    for p in range(0, len(idx), 12):
        ident, offset, n = struct.unpack_from("<III", idx, p)
        media[ident] = chunks["DATA"][offset : offset + n]
    return objs, media


EVENTS = {
    "folder-move": "play_interactive_terminal_left_square_move",
    "folder-select": "play_interactive_terminal_left_square_select",
    "document-move": "play_interactive_terminal_right_rectangle_move",
    "document-select": "play_interactive_terminal_right_rectangle_select",
    "boot": "player_uses_interactive_terminal_boot_up",
    "shutdown": "player_uses_interactive_terminal_boot_down",
    "idle": "player_uses_interactive_terminal_start",
    "light-flash": "Play_InteractiveTerminal_LightFlash",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--game", required=True, type=pathlib.Path)
    parser.add_argument("--decoder", required=True)
    parser.add_argument(
        "--work", type=pathlib.Path, default=pathlib.Path("/tmp/stoopidlink-audio-raw")
    )
    parser.add_argument(
        "--out", type=pathlib.Path, default=pathlib.Path("public/assets/audio")
    )
    parser.add_argument(
        "--manifest",
        type=pathlib.Path,
        default=pathlib.Path("docs/audio-manifest.json"),
    )
    args = parser.parse_args()
    sound = args.game / "DATA/SOUND"
    objects, embedded = bank(sound / "UI.BNK")
    args.work.mkdir(parents=True, exist_ok=True)
    args.out.mkdir(parents=True, exist_ok=True)
    external = {int(p.stem): p for p in sound.glob("*.WEM") if p.stem.isdigit()}
    manifest = {
        "source": "Alien: Isolation DATA/SOUND/UI.BNK",
        "codec": "Opus, 48 kHz",
        "events": {},
    }

    def sources(ident, seen=None):
        seen = set() if seen is None else seen
        if ident in seen or ident not in objects:
            return []
        seen.add(ident)
        kind, data = objects[ident]
        if kind == 2:
            return [(ident, u32(data, 8))]
        if kind == 4:
            return sum(
                (sources(u32(data, i), seen) for i in range(4, len(data), 4)), []
            )
        if kind == 3:
            return sources(u32(data, 2), seen) if data[1] == 4 else []
        if kind in (5, 6, 7, 9):
            # Container child IDs are explicit references. Only follow descendants,
            # not the audio-bus/parent IDs stored in the common object header.
            result = []
            for pos in range(10, len(data) - 3):
                child = u32(data, pos)
                if child in objects and objects[child][0] in (2, 5, 6, 7, 9):
                    childdata = objects[child][1]
                    if struct.pack("<I", ident) in childdata[:45]:
                        result += sources(child, seen)
            return list(dict.fromkeys(result))
        return []

    for semantic, event in EVENTS.items():
        bankname = (
            "DYNAMICLOAD_SCI_HOSPITALLOWER.BNK"
            if semantic == "light-flash"
            else "UI.BNK"
        )
        objects, embedded = bank(sound / bankname)
        files = []
        provenance = []
        event_sources = sources(fnv(event))
        # The interface uses only the first electrical-flash source for errors.
        if semantic == "light-flash":
            event_sources = event_sources[:1]
        for index, (obj, media) in enumerate(event_sources):
            raw = args.work / f"{media}.wem"
            wav = args.work / f"{media}.wav"
            if media in embedded:
                raw.write_bytes(embedded[media])
            elif media in external:
                raw = external[media]
            else:
                raise FileNotFoundError(f"Missing WEM {media}")
            subprocess.run(
                [args.decoder, "-i", "-o", str(wav), str(raw)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            filename = f'{semantic}{"-"+str(index+1) if index else ""}.ogg'
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-v",
                    "error",
                    "-i",
                    str(wav),
                    "-map_metadata",
                    "-1",
                    "-c:a",
                    "libopus",
                    "-b:a",
                    "64k",
                    str(args.out / filename),
                ],
                check=True,
            )
            files.append(f"assets/audio/{filename}")
            provenance.append({"objectId": obj, "mediaId": media})
        manifest["events"][semantic] = {
            "event": event,
            "bank": bankname,
            "eventId": fnv(event),
            "files": files,
            "provenance": provenance,
            "loop": semantic == "idle",
        }
    impact = args.work / "impact.webm"
    if impact.exists():
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-i",
                str(impact),
                "-map_metadata",
                "-1",
                "-af",
                "alimiter=limit=0.85",
                "-c:a",
                "libopus",
                "-b:a",
                "80k",
                str(args.out / "impact.ogg"),
            ],
            check=True,
        )
        manifest["events"]["impact"] = {
            "files": ["assets/audio/impact.ogg"],
            "source": "https://www.youtube.com/watch?v=U0-BWP2M3kg",
            "loop": False,
        }
    manifest["aliases"] = {
        "scroll": "document-move",
        "error": "light-flash",
        "back": "folder-select",
    }
    for event in manifest["events"].values():
        event["durationSeconds"] = [
            round(
                float(
                    subprocess.check_output(
                        [
                            "ffprobe",
                            "-v",
                            "error",
                            "-show_entries",
                            "format=duration",
                            "-of",
                            "default=noprint_wrappers=1:nokey=1",
                            str(args.out / pathlib.Path(f).name),
                        ],
                        text=True,
                    )
                ),
                4,
            )
            for f in event["files"]
        ]
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
