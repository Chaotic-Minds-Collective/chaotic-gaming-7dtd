# 7DTD Player Identity Integration

The bridge can optionally resolve a game event's external player ID to a verified Chaotic Gaming player account.

## Permission

Create a service account scoped to the target server with the `game_event_publisher` role. That role receives event-publishing and verified-player-resolution permissions.

```bash
npm run service:create -- 7dtd-event-bridge --role game_event_publisher --scope-type server --scope-id <SERVER_UUID>
```

Keep the returned service token in the game host's secret store. Never place it in the website or a public repository.

## Configure source event mapping

`SDTD_EVENT_MAP` accepts exact event names from the running server's SSE documentation. Values may be a normalized event name string or an object.

Example only:

```json
{
  "PlayerJoined": {
    "type": "player.joined",
    "provider": "steam",
    "playerIdField": "player.steamId"
  },
  "PlayerLeft": {
    "type": "player.left",
    "provider": "steam",
    "playerIdField": "player.steamId"
  }
}
```

Replace the source event names and `player.steamId` field path with the exact values returned by the target 7DTD server build. Do not assume these example names are valid for every build.

## Event behavior

- A mapped player event resolves the configured provider + external ID through Core.
- Verified linked accounts add a `chaoticGamingPlayer` object containing the internal principal ID and public player name.
- Unlinked or unverified accounts return `{ "linked": false }`.
- If Core identity lookup is unavailable, the event is still queued and published with `identityResolutionStatus: "unavailable"`.
- Missing external IDs are reported in bridge logs; the source event is still retained.
- The bridge never creates accounts or links identities. Ownership verification is handled by the website/Core account flow.

The original provider event ID remains the idempotency key for event ingestion.
