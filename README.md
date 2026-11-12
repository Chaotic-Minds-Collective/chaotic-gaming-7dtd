# Chaotic Gaming 7 Days to Die Adapter

A standalone heartbeat agent for the 7 Days to Die dedicated server. It queries the server with GameDig and reports status to the Chaotic Gaming Core.

## Included
- Game-specific GameDig query type: `7d2d`.
- Server-scoped authenticated heartbeat to Core.
- Skips a heartbeat when the game query fails instead of falsely reporting the server offline.
- Runs independently from the Discord bot and website.

## Not implemented yet
This is the first monitoring bridge, **not an in-game mod**. It does not yet read game events, modify inventories, deliver purchased items, install mods or execute administrative commands. Those features require verified server-side APIs and isolated compatibility testing for the exact game build.

## Setup
1. Register the dedicated game server in Core using the Core server-registration instructions.
2. Create a service account scoped to that exact server UUID:
   `npm run service:create -- 7dtd-adapter --role server_heartbeat --scope-type server --scope-id <SERVER_UUID>`
3. Copy the generated token once into the local secret environment. Never commit it.
4. Copy `.env.example` to `.env` and set the Core URL, token, server UUID, query host/port and exact server build.
5. Run `npm install`, `npm test`, then `npm start`.

## Security
- The service token must have only `servers.heartbeat` for one server.
- Do not expose query ports publicly unless the game requires it.
- Never place the service token in browser code, game clients or Discord.
- Use HTTPS for Core API communication in production.
- Do not point the agent at production until server registration and compatibility testing are approved.
