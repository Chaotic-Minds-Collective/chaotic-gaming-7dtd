# 7DTD Server Bridge (0.2.0)

A dependency-free Node.js bridge for the 7 Days to Die dedicated-server Web API, Server-Sent Events, and Chaotic Gaming Core.

## Web API

The client supports the game's named API-token headers:
- `X-SDTD-API-TOKENNAME`
- `X-SDTD-API-SECRET`

The secret is a password. Keep it in a server-side environment or secret manager. Never expose it to the browser, Discord client, or repository. Requests carrying token headers require HTTPS by default, redirects are rejected, and resolved paths must stay on the configured origin.

Endpoint paths are deliberately configured by the operator from the OpenAPI/RapiDoc document exposed by the exact running server build. Do not assume paths or event names from another server version.

## Core event bridge

The bridge:
- Opens the configured SSE endpoint using the existing authenticated Web API client.
- Parses SSE frames with the tested parser.
- Maps only explicitly configured provider event names to Core's normalized event types.
- Requires provider event IDs for deduplication.
- Writes events to a local JSONL spool before delivery.
- Retries queued events when Core is temporarily unavailable.
- Publishes through a dedicated server-scoped Core service credential.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:48b7115750bc78927084d29ac387c1da5f315342c494f3b1ff3352f11aa48f8c -->

The spool defaults to `./data/core-events.jsonl`. Keep the data directory private to the service account; it may contain player event payloads. The queue has event and byte limits and refuses new events rather than silently dropping old ones.

Locally invalid events are saved in `<spool path>.quarantine.jsonl` before removal from the pending queue. Quarantine is capped at 50 MiB by default; callers of `DurableEventSpool` can configure `maxQuarantineBytes` as a positive integer byte limit. The limit includes UTF-8 JSON and newline bytes and survives restarts. If an append would exceed the limit, flushing fails with a clear error and leaves the pending spool intact. Stop the bridge, archive or remove quarantine entries, then restart to resume delivery; entries are never automatically discarded.

<!-- /coderabbit-ai-generated:v1 -->

## Setup

Configure `SDTD_API_URL`, `SDTD_API_TOKEN_NAME`, `SDTD_API_TOKEN_SECRET`, `SDTD_SSE_ENDPOINT`, `SDTD_EVENT_MAP`, `CORE_API_BASE_URL`, `CORE_API_SERVICE_TOKEN`, and `CORE_SERVER_ID`.

The `SDTD_EVENT_MAP` JSON object maps exact source event names to one of:
`player.joined`, `player.left`, `player.chat`, `server.started`, `server.stopped`, `player.died`.

Create a Core service account with the `game_event_publisher` role scoped to this server. Never use a platform administrator credential.

## Development

- `npm test`
- `npm run check`
- `npm run bridge` (requires real server and Core credentials)

No live server or Core database has been connected or modified.
