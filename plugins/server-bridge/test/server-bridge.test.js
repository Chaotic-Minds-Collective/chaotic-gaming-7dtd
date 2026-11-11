import test from "node:test";
import assert from "node:assert/strict";
import { SevenDaysWebApiClient, SevenDaysApiError } from "../src/client.js";
import { parseServerSentEvents } from "../src/sse.js";

test("uses the named 7DTD API token headers and parses JSON", async () => {
  let captured;
  const client = new SevenDaysWebApiClient({
    baseUrl: "http://127.0.0.1:8080/",
    tokenName: "chaotic-bridge",
    tokenSecret: "test-secret",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ data: [] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await client.request("/api/example");
  assert.deepEqual(result, { data: [] });
  assert.equal(captured.options.headers.get("X-SDTD-API-TOKENNAME"), "chaotic-bridge");
  assert.equal(captured.options.headers.get("X-SDTD-API-SECRET"), "test-secret");
  assert.equal(captured.url, "http://127.0.0.1:8080/api/example");
});

test("rejects absolute URLs and path traversal", () => {
  const client = new SevenDaysWebApiClient({ baseUrl: "http://localhost:8080" });
  assert.throws(() => client.buildUrl("https://evil.example/path"), /absolute URLs/);
  assert.throws(() => client.buildUrl("../admin"), /path traversal/);
});

test("requires both token fields when either is configured", () => {
  const client = new SevenDaysWebApiClient({
    baseUrl: "http://localhost:8080",
    tokenName: "name"
  });
  assert.throws(() => client.buildHeaders(), /Both tokenName and tokenSecret/);
});

test("surfaces non-success HTTP responses without leaking request secrets", async () => {
  const client = new SevenDaysWebApiClient({
    baseUrl: "http://localhost:8080",
    tokenName: "name",
    tokenSecret: "secret-value",
    fetchImpl: async () => new Response('{"error":"denied"}', { status: 403 })
  });
  await assert.rejects(
    client.request("api/private"),
    (error) => error instanceof SevenDaysApiError &&
      error.status === 403 &&
      !error.message.includes("secret-value")
  );
});

test("parses SSE frames across chunk boundaries", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    "event: player.joined\ndata: {\"player\":",
    "\"Ada\"}\nid: 42\n\n: heartbeat\n",
    "data: second\ndata: line\n\n"
  ];
  const stream = new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(encoder.encode(chunks.shift()));
      else controller.close();
    }
  });
  const events = [];
  for await (const item of parseServerSentEvents(stream)) events.push(item);
  assert.deepEqual(events, [
    { event: "player.joined", data: '{"player":"Ada"}', id: "42" },
    { event: "message", data: "second\nline" }
  ]);
});
