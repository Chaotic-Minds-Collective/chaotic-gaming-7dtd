# 7DTD Server Bridge (0.1.0)

A small, dependency-free Node.js client foundation for the 7 Days to Die dedicated-server Web API and Server-Sent Events.

## Why this exists
Many server-management features can be delivered outside the game process. That can avoid requiring client-side mod installation and preserve crossplay/EAC compatibility for features supported by the native API.

## Authentication
The client supports the game's named API-token headers:
- `X-SDTD-API-TOKENNAME`
- `X-SDTD-API-SECRET`

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:0d73abee7e031762c73aa54d8a3a837e84ea66138ea3f9dad8ed13bb73d30adb -->

Treat the secret as a password. Store it in server-side environment variables or a secret manager. Never expose it to the browser, Discord client, or repository.

Requests carrying either API token header require HTTPS by default, including when headers are supplied per request. For local development only, explicitly set the constructor option `allowInsecureHttp: true` to permit plaintext HTTP; this exposes tokens to network observers. Unauthenticated HTTP remains supported. Requests reject redirects to prevent token forwarding; configure the final API URL directly. Resolved endpoint URLs must stay on the configured origin.

<!-- /coderabbit-ai-generated:v1 -->

## Usage
```js
import { SevenDaysWebApiClient } from "./src/client.js";

const client = new SevenDaysWebApiClient({
  baseUrl: process.env.SDTD_API_URL,
  tokenName: process.env.SDTD_API_TOKEN_NAME,
  tokenSecret: process.env.SDTD_API_TOKEN_SECRET
});

// Supply a path copied from the OpenAPI document served by your exact server build.
const result = await client.request(process.env.SDTD_STATUS_ENDPOINT);
```

The endpoint is deliberately configurable. Do not assume paths from another server version. The server's own OpenAPI/RapiDoc documentation is authoritative.

## SSE
`parseServerSentEvents(readableStream)` parses standard SSE frames. The caller owns connection setup, reconnection policy, and endpoint selection; those details must be checked against the target server's live documentation.

## Development
- Node.js 20.9+
- `npm test`
- `npm run check`

## Status
Initial client and parser scaffold. It has not yet been run against a live 7DTD server. No endpoint contract or game-version compatibility is claimed yet.
