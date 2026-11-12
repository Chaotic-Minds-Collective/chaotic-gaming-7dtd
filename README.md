# Chaotic Gaming — 7 Days to Die Adapter

Game-specific integration for 7 Days to Die. The adapter communicates with Chaotic Gaming Core through authenticated APIs and does not access Core's PostgreSQL database.

## Current implementation

- A small TCP Telnet client for the built-in 7DTD server interface.
- Password-prompt authentication.
- Explicit read-only command allowlist: `gettime`, `listplayers`, `listplayerids`, `version`.
- A continuous heartbeat process that reports online/offline status to Core.
- Bounded connect/command timeouts and response-size limits.
- Tests using a local fake Telnet server.

No moderation, world mutation, player item grants, or server shutdown commands are enabled.

## Setup

1. Use a dedicated 7DTD server configuration file and enable Telnet.
2. Set a strong `TelnetPassword`. The built-in server binds Telnet to loopback when the password is empty; do not expose the interface publicly.
3. Restrict Telnet access to localhost or a private/VPN network and firewall the port.
4. Copy `.env.example` to `.env` and fill in the Core URL, server-scoped service token, Core server UUID, exact server version and Telnet connection details.
5. Run `npm install`, `npm test`, then `npm run heartbeat`.

Create a dedicated Core service identity with the `server_heartbeat` role scoped to this server UUID. Do not use a platform administrator credential.

## Compatibility

The Telnet handshake and `gettime` command are based on the 7DTD built-in Telnet interface and console command documentation. Exact server version and mod compatibility still require an isolated server test.

## Status

Adapter source and unit tests are committed. No live server has been connected, configured, or modified.
