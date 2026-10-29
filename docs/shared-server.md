# Shared files server

The first two Shared files use a small Go HTTP server and SQLite. The existing video stays local and works independently of the API. The frontend uses native EventSource, Canvas, AudioWorklet and Web Audio; no additional JavaScript dependencies.

## Prerequisites

Requires Go 1.23.2+ and a C compiler (the SQLite driver uses CGO).

## Automatic server deployment

`.github/workflows/server.yml` deploys on pushes to `main` that change `server/`,
`go.mod`, `go.sum` or the workflow itself. It can also be run manually from Actions.
CI installs current stable Go, tests and builds a static Linux binary, sends only
that binary with rsync over SSH, updates `stoopidlink.service`, enables boot startup
and restarts the service. There is no Node or container step in the server workflow.
The target needs SSH, rsync and systemd; the SSH account must be root or have
passwordless sudo. Go is not required on the target.

Configure these repository **Actions Variables**:

| Name                | Value                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `SERVER_ADDR`       | `se.mipselqq.uk` — hostname/IP only, without scheme or port                                   |
| `SERVER_PORT`       | `50026` — API listening port                                                                  |
| `SERVER_HTTPS_PORT` | `50027` — public Caddy HTTPS port; defaults to `50027`                                        |
| `SERVER_CORS`       | `mipselqq.uk` — allowed browser origin domains, comma-separated; this is the workflow default |
| `SERVER_SSH_USER`   | Optional SSH login; defaults to `root`                                                        |
| `SERVER_SSH_PORT`   | Optional SSH port; defaults to `22`                                                           |

Configure **Actions Secrets**:

| Name                     | Value                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `SERVER_SSH_PRIVATE_KEY` | Private SSH key for the target account, without a passphrase; `SSH_PRIVATE_KEY` is also accepted     |
| `SERVER_SSH_KNOWN_HOSTS` | Optional pinned SSH host-key entries; otherwise CI collects the target's host key with `ssh-keyscan` |

The public half of the private key must be in the target account's
`~/.ssh/authorized_keys`. The SSH port and API port are separate settings.

The service listens on `:SERVER_PORT`. Its database remains at
`/var/lib/stoopidlink/shared.sqlite` across deployments. Existing proxy settings
in `/etc/stoopidlink/server.env` are retained. Inspect the service with:

```sh
systemctl status stoopidlink.service
journalctl -u stoopidlink.service -f
```

The old local installer has been removed. The `net/netip` build error indicates
an outdated Go toolchain: that standard-library package was added in Go 1.18.
The workflow builds with current Go, independently of the target's installed Go.

## Local development

```sh
go run ./server
npm run dev -- --port 4173
```

The API listens on `127.0.0.1:8081`. Vite development and preview servers proxy `/api` there. The SQLite database is `data/shared.sqlite`, excluded from Git. Pixels and recordings survive restarting the process. Back up the database with SQLite's backup command when the server is running (or stop it before copying the database and its WAL files).

```sh
npm run build
npm run preview -- --port 4174
go test -race ./server
npm test
```

## Deployment

A single server can also serve the built frontend:

```sh
npm run build
go run ./server -addr 127.0.0.1:8081 -db data/shared.sqlite -static dist
```

Put an HTTPS reverse proxy in front of it, forwarding `/api` as well as static requests. The server trusts `X-Forwarded-For` only from configured proxy CIDRs (loopback by default), walking from the nearest trusted hop. Set `-trusted-proxies` to the actual proxy CIDRs when the proxy is on another address; an empty value trusts none. Have the proxy append the real connecting IP, and restrict direct access to the backend as usual. Vite forwards the local client IP automatically.

Disable proxy buffering for `/api/shared/events` (the server sends `X-Accel-Buffering: no`). Microphone capture requires HTTPS, except on localhost.

For a frontend hosted on GitHub Pages, host this Go process separately and set its HTTPS API URL at build time:

```sh
VITE_SHARED_API_URL=https://shared.example.com/api npm run build
```

GitHub Pages itself cannot run Go or SQLite. If the API is unavailable, the canvas and voice files show `DATA CORRUPTED` and reconnect automatically; the third file, the local video, remains available. There are no accounts or cookies; `SERVER_CORS` controls which browser pages may read API responses, and does not authenticate requests from other clients.

### GitHub Actions / Pages

The workflow in `.github/workflows/pages.yml` checks formatting, runs frontend
tests, builds the bundle and verifies its local module/worker imports. Pull
requests run these checks without publishing. Pushes to `main` and manual runs
on the default branch publish only `dist/` through the official Pages artifact
and deployment actions. Go, SQLite, source files and test pages are not published.

Both workflows read `SERVER_ADDR` and `SERVER_PORT`; Pages also reads
`SERVER_HTTPS_PORT`, and server deployment reads `SERVER_CORS`. For
`SERVER_ADDR=se.mipselqq.uk`, `SERVER_PORT=50026` and
`SERVER_HTTPS_PORT=50027`, the frontend build receives
`VITE_SHARED_API_URL=https://se.mipselqq.uk:50027/api`, while the Go server
listens on `:50026`. Set `SERVER_CORS=mipselqq.uk` (or a
comma-separated list such as `mipselqq.uk,www.mipselqq.uk`) to permit browser
requests from those exact domains. Schemes and ports are ignored when matching
the browser's Origin; subdomains need their own entry. An empty value disables
cross-origin browser access. After changing `SERVER_ADDR` or `SERVER_HTTPS_PORT`,
rerun the Pages workflow; after changing `SERVER_PORT` or `SERVER_CORS`, rerun
server deployment.

Put Caddy in front of the Go service to terminate HTTPS. For
`se.mipselqq.uk`, with port `443` already occupied and `50027` available, add
this site to the existing Caddyfile:

```caddyfile
se.mipselqq.uk:50027 {
    reverse_proxy 127.0.0.1:50026 {
        flush_interval -1
    }

    tls {
        issuer acme {
            disable_tlsalpn_challenge
        }
    }
}
```

This serves HTTPS on `50027` and disables the TLS-ALPN challenge so Caddy does
not try to use the occupied `443`. The ACME HTTP challenge still needs public
port `80` to reach Caddy. The domain must point to this server, and the firewall
must allow inbound ports `50027` and `80`. See the [Caddyfile address rules](https://caddyserver.com/docs/caddyfile/concepts)
and [ACME TLS options](https://caddyserver.com/docs/caddyfile/directives/tls).
Microphone recording requires HTTPS or localhost. For another proxy layout, the frontend URL can still be overridden
with `VITE_SHARED_API_URL` in another build configuration.

In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the
source. The workflow uses the `github-pages` deployment environment. Assets use
relative URLs, so the same bundle works at the domain root and under a repository
path such as `/stoopidlink/`.

To reproduce the Pages build locally:

```sh
npm ci
npm run format:check
npm test
SERVER_ADDR=se.mipselqq.uk SERVER_PORT=50026 npm run build:pages
npm run check:build
```

The normal `npm run build` keeps the local `/api` proxy default. You can still
override `VITE_SHARED_API_URL` directly for other hosting arrangements.

References: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and [Vite build-time environment variables](https://vite.dev/guide/env-and-mode.html).
Go toolchain reference: [Go 1.18 release notes](https://go.dev/doc/go1.18#net/netip).

### Code formatting

`npm run format` formats TypeScript, JavaScript, CSS, HTML, JSON, Markdown and YAML;
`npm run format:check` checks the same files without changing them. Prettier leaves
embedded HTML/SVG strings untouched so formatting does not alter their rendered
whitespace. Generated data, binary/public assets and physics fixtures are excluded.
Use `gofmt -w server` for Go and `uvx black tools/audio/extract_audio.py` for the
optional audio extraction helper.

## Data and limits

- Canvas: 384 × 192 stored pixels (older drawings are migrated without losing their contents; widening adds empty space at the right edge), 16 fixed CRT colors. The display uses a 2 × 2 CSS pixel grid to match the dot in the 16px Jix font, resampling the same shared board on smaller screens. Batches are validated and saved in one SQLite transaction before being broadcast through server-sent events. Reconnecting clients receive a complete snapshot.
- Voices: public recordings with titles of up to 40 characters. The UI stops recording after 30 seconds; the server independently caps uploads at 2 MiB and accepts mono 11,025 Hz / 16-bit PCM WAV input of at most 30 seconds. The Go server compresses it losslessly to FLAC before storing it in SQLite; no ffmpeg installation or browser codec library is needed. Browser echo cancellation, noise suppression and automatic gain control are explicitly disabled. Capture uses the native microphone rate, followed by Web Audio resampling and signed 16-bit PCM encoding. Previously saved clips stay playable. The most recent 100 recordings appear in the folder; older recordings remain in SQLite.
- Each IP may successfully submit **2 voices per UTC calendar day** (reset at 00:00 UTC). Counters are persisted in SQLite, in the same transaction as the recording; invalid uploads do not consume quota. Further uploads return HTTP 429 with `Retry-After`. The drawing board and playback remain available.
- Audio is stored as BLOBs in SQLite, with MIME type and creation time. Media requests support byte ranges. Titles are rendered as text, never HTML.
- Storage is capped at 1000 recordings / 64 MiB of audio and a 128 MiB SQLite main database. New uploads are refused with HTTP 507 when full; existing recordings are retained.
- Games have one anonymous global best each; Gravity stores one fastest completion per level, shared across engines. No attempt history is retained.
- See [the security review](shared-security.md) for request/concurrency limits, tests and remaining limitations.
- No accounts, deletion UI, or moderation service. For a public installation, configure request/storage limits in the hosting reverse proxy as appropriate for its traffic.

## API

| Method | Path                             | Purpose                                                            |
| ------ | -------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/shared/canvas`             | Full pixel snapshot                                                |
| POST   | `/api/shared/pixels`             | JSON array of `{x,y,color}` (1–512 pixels)                         |
| GET    | `/api/shared/events`             | SSE: `canvas`, `pixels`, `voices`, `heartbeat`                     |
| GET    | `/api/shared/voices`             | Newest 100 voice metadata records                                  |
| POST   | `/api/shared/voices`             | Multipart `name` and PCM WAV `audio`; persists FLAC; 2/IP/day      |
| GET    | `/api/shared/voices/{id}`        | Audio content                                                      |
| GET    | `/api/games/best/{game}/{level}` | One best value or null                                             |
| POST   | `/api/games/best`                | `{game,level,value}`; atomically replace only with a better result |
