# Shared content security review

Reviewed 2026-10-29. This is a code review with targeted tests, not a claim of complete security or a substitute for deployment/network protection.

## Injection boundaries

Visitor titles enter ordinary text nodes (`voiceName` / `textContent`), never HTML, scripts, styles, or dynamic event attributes. Names have a 40-character server limit, a matching input limit, and reject invalid UTF-8, control characters and Unicode formatting controls. Literal markup can be displayed safely as text. SQL values are parameters; user filenames are ignored and never become filesystem paths. Pixel positions and palette indices have strict numeric bounds and unknown JSON fields are rejected. Game keys come from three allowlisted games and 30 fixed Gravity levels.

Uploads accept only bounded mono 11025 Hz, 16-bit PCM WAV input, validate RIFF/chunk sizes and duration, then create a new FLAC stream from the PCM samples. Uploaded metadata and other container chunks are not copied into stored media. User content is in SQLite, outside the static frontend folder. API responses use explicit JSON/audio MIME types, `nosniff` and a restrictive sandbox CSP for direct navigation.

This follows the safe text-sink and validated/re-encoded upload approach described by the [OWASP XSS guide](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) and [OWASP upload guide](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Resource bounds

| Resource                          | Default bound                                                      |
| --------------------------------- | ------------------------------------------------------------------ |
| Voice name                        | 40 characters, no controls                                         |
| Upload request                    | 2 MiB audio + 16 KiB multipart overhead                            |
| Recorded PCM                      | mono 11025 Hz / 16 bit / 30 seconds                                |
| Accepted voices per IP            | 2 per UTC calendar day, transactional SQLite counter               |
| Stored voice count                | 1000; refuse new uploads when full                                 |
| Stored audio bytes                | 64 MiB; checked again inside the insert transaction                |
| SQLite main database              | 128 MiB via `max_page_count`; existing data is not deleted         |
| Retained WAL target               | 8 MiB, with automatic checkpoints (not a total filesystem quota)   |
| Uploads in progress               | 4 globally, 2 per IP                                               |
| Ordinary API requests in progress | 32 globally, 8 per IP                                              |
| SSE streams                       | 64 globally, 4 per IP; slow subscribers disconnected               |
| API request rate                  | 200/s globally, 40/s per IP; bounded bursts                        |
| Pixel POST rate                   | 100/s globally, 25/s per IP                                        |
| Pixel updates                     | 8192/s globally, 2048/s per IP; 512 pixels per request             |
| Canvas storage                    | One row per coordinate; at most 384 × 192 rows                     |
| Limiter state                     | 8192 IP entries, stale idle entries expire                         |
| Game record storage               | One current value per key, at most 32 rows; no attempt history     |
| Game result input                 | 256-byte body, positive bounded integer, allowlisted game/level    |
| Gravity result                    | 1000–3600000 ms, divisible by the 15 ms simulation tick            |
| Flappy result                     | 1–10000 points                                                     |
| Tetris result                     | 2–10000000 points, even (all scoring operations award even points) |
| Game result POST rate             | 1 per 5 seconds per IP, burst 4                                    |

Storage exhaustion returns 507 without deleting old recordings. Daily quotas are checked before reading or encoding an upload, then atomically reserved together with the insert. Concurrent requests cannot overshoot quotas or storage bounds. Expired daily counters are pruned on successful uploads. Slow readers do not hold the global mutation lock. Request/header/write deadlines and header size limits bound ordinary HTTP work; stream writes have individual deadlines.

Game result fields are all required and non-null. Fractional, non-numeric, overflowing, negative, out-of-range and mechanically impossible values return HTTP 400 before any database mutation. Gravity's one-second floor is a deliberately conservative plausibility check, not an exact minimum per track. Score ceilings are acceptance limits, not proof that a run occurred.

Forwarded IPs are accepted only through configured trusted proxy CIDRs, walking the chain from the closest hop. Raw client-provided forwarding headers are ignored across untrusted peers. IPv4-mapped IPv6 addresses are normalized. Rate-limit/overload errors do not turn the UI into `DATA CORRUPTED`.

## Verification

`go test -race ./server`, `go vet ./server`, frontend tests and production build cover malformed containers, oversized data, title and SQL/XSS payloads, invalid pixel/game keys, atomic daily counters, concurrent submissions, persisted quotas, full storage, rate limits, bounded limiter memory, stream concurrency and headers. `tests/content-safety.html` checks the production title-rendering function with HTML payloads in the browser. Dependency checks: `govulncheck ./server` and `npm audit --omit=dev` reported no known vulnerabilities during this review.

## Limits of the guarantees

Anonymous IP quotas can be bypassed by changing real IPs; shared NAT users share one quota. A public collaborative board can be vandalized within the allowed rate. Game scores are calculated in the browser and validated for shape/range, not replayed authoritatively on the server, so a forged plausible score remains possible. No personal identity is attached to a record.

Application bounds cannot prevent network-volume DDoS, OS/browser/codec zero-days, a compromised trusted proxy, or someone with direct access to the database. Use a reverse proxy/CDN with connection, bandwidth and request limits for a public deployment, keep dependencies patched, and keep the database outside the public static root. The Go process is bound to loopback by default.
