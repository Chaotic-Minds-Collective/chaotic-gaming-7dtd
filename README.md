# CMG 7DTD Plugin

Game-specific integration for 7 Days to Die within Chaotic Minds Gaming (CMG). The adapter communicates with Chaotic Gaming Core through authenticated APIs and must not access Core's PostgreSQL database directly.

## Planned capabilities

- Server registration and health heartbeats
- Player identity mapping and session lifecycle
- World/server status and validated server events
- Configuration and administrative operations behind scoped permissions
- Purchase entitlement delivery only after server-side payment confirmation

## Existing integration foundation

The `plugins/server-bridge` module is the primary integration path. It provides a dependency-free client for the dedicated server's Web API and a Server-Sent Events parser. Endpoint paths are deliberately supplied by the operator from the OpenAPI/RapiDoc documentation exposed by the exact running server build. The adapter does not assume endpoint paths or event names from another version.

## Core integration

The root adapter package adds a Core heartbeat process and a restricted Telnet health-check client. Telnet is optional and is not the preferred integration path for game data. Keep it bound to loopback or a private management network, set a strong password, and never expose it publicly. Only a short allowlist of read-only commands is enabled.

## Development

- Node.js 22+
- `npm install`
- `npm test`
- `npm run check`

The nested `plugins/server-bridge` module can also be tested independently with `npm --prefix plugins/server-bridge test`.

## Compatibility

Do not assume a particular 7DTD version, server manager, mod loader, Web API endpoint, SSE event name, or RCON/Telnet command set. Record exact versions and validate against a disposable server before claiming support.

## Status

The Web API/SSE client foundation and optional Telnet heartbeat helper are committed with automated tests. No live server has been connected, configured, or modified.
