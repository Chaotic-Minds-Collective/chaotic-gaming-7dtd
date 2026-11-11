# Chaotic Gaming — 7 Days to Die Integrations

Original, modular integrations and server-side plugins for the Chaotic Gaming 7 Days to Die network.

## Strategy
Use the game's built-in dedicated-server Web API and event stream first. This allows many high-value features to live outside the game process and can preserve crossplay/EAC compatibility when no mod files are installed. Verify every endpoint against the exact running server's own OpenAPI documentation before implementing it.

Use XML modlets for small configuration/data changes that the native server syncs. Reserve C# ModAPI/Harmony for features that cannot be delivered externally or through XML.

## Planned first integrations
1. Server Status & Health
2. Player Sessions & Statistics
3. Announcements & Scheduler
4. Chat Bridge
5. Admin Toolkit
6. Audit & Activity Log
7. Player Support & Reports
8. Events & Challenges
9. Rewards & Entitlements
10. Leaderboards
11. Backup & Recovery Coordinator
12. Server Configuration Manager
13. Anti-Abuse Rules
14. Economy Adapter
15. Starter Kits & Welcome Flow (subject to a validated server-side delivery mechanism)

## Compatibility rules
Every feature states:
- Dedicated server only, client only, or both
- Whether a mod folder or client installation is required
- EAC impact
- Crossplay impact
- Supported game version(s)
- Required server API endpoints or assemblies

Prefer external Web API integrations for monitoring, chat, scheduling, admin workflows and dashboards. Keep API credentials server-side and restrict them to minimum permissions.

## Repository rules
- Do not edit vanilla game files.
- Do not copy third-party mod source or assets.
- Do not assume an endpoint exists; inspect the live server OpenAPI spec for the target build.
- Make event processing idempotent and tolerant of reconnects.
- Never trust client-submitted rewards, currency or admin permissions.
- Test on a disposable world/server before release.

See the central catalogue in [chaotic-gaming-docs](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-docs).
