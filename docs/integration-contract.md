# 7 Days to Die Integration Contract

The adapter must implement the shared SDK's game adapter health and event contracts.

Required behaviors:
- Authenticate as a dedicated service identity.
- Identify its assigned server and environment.
- Send heartbeats with server version and adapter version.
- Normalize player join/leave and server lifecycle events.
- Use idempotency keys when reporting events or delivering rewards.
- Reject commands outside its assigned server scope.
- Buffer transient event delivery failures locally with bounded retry/backoff.

Exact game hooks and command mappings remain version-dependent and must be validated in a test server.
