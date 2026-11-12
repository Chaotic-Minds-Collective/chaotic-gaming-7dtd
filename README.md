# Chaotic Gaming — 7 Days to Die Adapter

Integration service between a 7 Days to Die dedicated server and Chaotic Gaming Core.

## Integration strategy

Start with the game's built-in dedicated-server Web API and Server-Sent Events (SSE) interface. This avoids requiring a custom server mod for the initial integration and keeps the adapter outside the game process.

The dedicated server's Web API is disabled by default. Enable it deliberately in `serverconfig.xml`, bind it to a trusted network interface, restrict firewall access, and create a dedicated API token with the lowest permission level that supports the required operations.

The exact API endpoints and response shapes must be discovered from the running server's own OpenAPI/RapiDoc documentation. Do not hardcode paths based on old tutorials.

## Current status

- [x] TypeScript adapter package scaffold
- [x] Token-header HTTP client
- [x] Generic SSE stream reader
- [ ] Validate API contract against the exact server build
- [ ] Add typed player/server endpoints from the live OpenAPI document
- [ ] Add Core event publishing and retry/outbox integration
- [ ] Add integration tests against an isolated server

## Authentication

The current Web API specification documents API token name and secret headers:
- `X-SDTD-API-TOKENNAME`
- `X-SDTD-API-SECRET`

Use a dedicated read-only token first. Never expose token values to the website or Discord bot. Store them only in the adapter's secret environment.

## Development

- Node.js 22+
- `npm install`
- Copy `.env.example` to `.env`
- `npm run typecheck`
- `npm run build`

No server is contacted during build or tests. No live server configuration is changed by this repository.
