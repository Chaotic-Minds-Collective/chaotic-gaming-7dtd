# Chaotic Gaming — 7 Days to Die Integration

Game-specific adapter for 7 Days to Die dedicated servers.

## First milestone
- Confirm target server version and supported administrative interfaces.
- Build a read-only status/heartbeat proof of concept first.
- Normalize player and server observations into shared SDK contracts.
- Add write operations only after authentication, permission checks, audit logging and idempotency exist.

Core owns Chaotic Gaming identity, permissions and entitlements. This adapter owns game protocol translation and server-specific observations. Never expose server credentials to web or Discord clients. Test against a disposable server first.

Scaffold only; no server connection or game-side action has been performed.
