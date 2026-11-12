# 7 Days to Die Integration Contract

Isolate version-specific server communication behind a stable internal interface. Record exact game/server version, protocol or API, authentication model, event coverage and rate limits before implementation. Start read-only. Administrative commands must be permission-scoped, audited, rate-limited and safe to retry. Do not assume an interface or command exists until confirmed against the target server version.
