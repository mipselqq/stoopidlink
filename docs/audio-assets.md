# Terminal audio extraction

`docs/audio-manifest.json` records named events, original Wwise IDs,
source banks, media IDs, variants, durations and web paths. All terminal SFX are
original game media, decoded from the installed game. The impact recording
comes from the user-supplied YouTube URL. No synthesized
SFX are included.

## Event behavior

- `folder-move` / `document-move`: original corresponding GFX navigation events.
- `folder-select` and `document-select`: choose one variant per play. These are
  random-container alternatives, not simultaneous audio layers.
- `boot`: original `player_uses_interactive_terminal_boot_up`, approximately 7.76 s.
  Let it continue while the approximately four-second visual boot finishes.
- `shutdown`: original boot-down sound, approximately 4.06 s.
- `idle`: original terminal-start source, approximately 1.82 s. Loop while active;
  decode once and loop the complete, unchanged buffer with Web Audio's audio clock
  (no crossfade or timer-based restarts). Suspend the context while the page is
  hidden and resume the same source when visible. Its source contains the game's loop.
- `light-flash`: the first media source reached from the original hospital-level
  `Play_InteractiveTerminal_LightFlash` event, used for interface errors. The other
  15 unused electrical variants are omitted from public assets and extraction output.
- `impact`: downloaded requested metal impact recording; approximately 4.89 s.

The terminal GFX names only the four movement/selection events. No independently
named terminal scroll or error event was found. The manifest aliases deliberately
reuse original movement/selection/shutdown sources; they do not claim to identify
additional original events.

Audio is Opus in Ogg, with 64 kbit/s target for game sources and 80 kbit/s for the
impact. Preserve source gain; use independent runtime gains for idle, UI and
impact, with headroom to prevent repeated strikes from clipping. Browser audio
must be unlocked by the initial key/click/tap before any auto-playback.

## Rebuild

The extraction never changes game files. Obtain and build vgmstream from
<https://github.com/vgmstream/vgmstream> outside the repository. The successful
build used `cmake -S . -B build -DBUILD_CLI=ON -DBUILD_V123=OFF
-DBUILD_AUDACIOUS=OFF -DUSE_FFMPEG=OFF -DUSE_MPEG=OFF`, then
`cmake --build build -j4`. FFmpeg must provide `libopus`.

```sh
mkdir -p /tmp/stoopidlink-audio-raw
yt-dlp --cookies-from-browser firefox -f bestaudio --no-playlist \
  -o '/tmp/stoopidlink-audio-raw/impact.%(ext)s' \
  'https://www.youtube.com/watch?v=U0-BWP2M3kg'
python tools/audio/extract_audio.py \
  --game '/run/media/lord/A4DA695BDA692AAE/GOG Games/Alien Isolation/' \
  --decoder /tmp/stoopidlink-vgmstream/build/cli/vgmstream-cli
```

Wwise FNV-1 hashes of known event names locate type-4 HIRC events. Those resolve
to type-3 actions, which reference sounds or containers. Container children are
restricted to objects whose common header references the parent, preventing
accidental traversal into the master audio bus. Sound source IDs select embedded
DIDX/DATA media or external WEM files. Decoder PCM and downloaded source media
stay under `/tmp`; production includes only the compact Ogg files. The provenance
manifest stays in `docs/` and is not shipped to browsers.

Validation: every delivered Ogg passed FFprobe and decoded successfully with
FFmpeg. Original IDs are preserved for traceability. Raw game files, downloaded
tools, browser cookies and PCM intermediates are excluded from public assets.
