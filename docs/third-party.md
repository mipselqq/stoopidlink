# Station training modules

Gravity Defied uses the fixed-point physics, terrain reader, original track archive and
Java reference traces from [MihailPreis/Wheelie](https://github.com/MihailPreis/Wheelie),
revision `a11ab72e4e83fcd97031145a4bcb4a8985af9e24`. That project ports the
[Android remaster](https://github.com/evgenyzinoviev/gravitydefied) of Codebrew's original.
The physics expressions and constants have not been changed. Import extensions and one constructor parameter-property desugaring are the
only adaptations inside `src/vendor/gravity`. The new presentation is in
`src/features/gravity.ts`. The component is GPL-2.0-only; its license and corresponding
source archive are shipped at `public/licenses/gravity-GPL-2.0.txt` and
`public/assets/games/gravity/source.zip` and linked inside the game. No warranty.

Chess move legality uses [chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause.
The small station bot is an alpha-beta search with iterative deepening, material and
piece-position evaluation, running in a dedicated worker. Its source is
`src/features/chess-engine.ts`; it shares the same legality rules as the board.

The archived video is the user-selected [YouTube video](https://www.youtube.com/watch?v=P5jCCarcuJ0).
The complete 152-second video was transcoded to 640-pixel H.264 / 24fps with mono
48kbps AAC and fast-start MP4, plus a small JPEG poster. It loads only in the selected
archive entry, with `preload="none"`. Firefox cookies were used by yt-dlp in memory;
no cookies are included in this project.

Tech-stack icons are original pixel SVG drawings made for this page. They depict the
technology's recognizable logo motifs and inherit the terminal text palette.

The Go gopher icon is a pixel adaptation of Renee French's mascot. Attribution is
recorded here: https://go.dev/blog/gopher (CC BY 4.0). Badge outlines and labels use
technology brand colors: Go cyan, PostgreSQL blue, Docker blue, Git orange, Linux and
JavaScript yellow, Prometheus/Grafana orange, Python blue, Rust copper, Redis red,
gRPC teal, Microsoft SQL red, C# purple, VS Code/Arch/KDE blue, fish green and Firefox
orange. Kitty uses neutral phosphor white because its terminal identity is monochrome.

The Shared server uses [mattn/go-sqlite3](https://github.com/mattn/go-sqlite3), MIT licensed (including its bundled SQLite amalgamation, public domain). The pinned module and its license are available through Go modules; it is a backend dependency only.

Lossless voice compression uses [mewkiz/flac](https://github.com/mewkiz/flac) (Unlicense) on the Go server, with [icza/bitio](https://github.com/icza/bitio) (Apache-2.0). No audio encoder library is added to the frontend.
