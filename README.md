# Chaotic Gaming — 7 Days to Die Adapter

Game-specific integration for 7 Days to Die. The adapter communicates with Chaotic Gaming Core through authenticated APIs and must not access Core's PostgreSQL database directly.

## Planned capabilities
- Server registration and health heartbeats
- Player identity mapping and session lifecycle
- World/server status and validated server events
- Configuration and administrative operations behind scoped permissions
- Purchase entitlement delivery only after server-side payment confirmation

## Compatibility
Do not assume a particular 7DTD version, server manager, mod loader, or RCON command set. Record exact versions and test against a disposable server before claiming support.

## Status
Interface and planning scaffold only. No server has been connected or modified.
