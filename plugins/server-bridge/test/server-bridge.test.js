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
    allowInsecureHttp: true,
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
    allowInsecureHttp: true,
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
    { event: "message", data: "second\nline", id: "42" }
  ]);
});

test("token headers require HTTPS unless explicitly opted into development HTTP", async () => {
  for (const tokenOptions of [
    { tokenName: "name", tokenSecret: "synthetic-secret" },
    { headers: { "X-SDTD-API-SECRET": "synthetic-secret" } },
    { headers: { "X-SDTD-API-TOKENNAME": "name" } }
  ]) {
    for (const baseUrl of ["http://remote.example", "http://127.0.0.1"]) {
      let calls = 0;
      const { headers, ...credentials } = tokenOptions;
      const client = new SevenDaysWebApiClient({
        baseUrl, ...credentials,
        fetchImpl: async () => { calls++; return new Response("ok"); }
      });
      await assert.rejects(client.request("api", { headers }), /require HTTPS/);
      assert.equal(calls, 0);
    }
  }
  for (const options of [
    { baseUrl: "https://remote.example", tokenName: "name", tokenSecret: "synthetic-secret" },
    { baseUrl: "http://remote.example" },
    { baseUrl: "http://localhost", allowInsecureHttp: true, tokenName: "name", tokenSecret: "synthetic-secret" }
  ]) {
    const client = new SevenDaysWebApiClient({ ...options, fetchImpl: async () => new Response("ok") });
    assert.equal(await client.request("api"), "ok");
  }
  assert.throws(() => new SevenDaysWebApiClient({
    baseUrl: "http://localhost", allowInsecureHttp: "false"
  }), /must be a boolean/);
});

test("rejects parsed cross-origin URLs before fetching", async () => {
  let calls = 0;
  const client = new SevenDaysWebApiClient({
    baseUrl: "https://trusted.example/api/", tokenName: "name", tokenSecret: "synthetic-secret",
    fetchImpl: async () => { calls++; return new Response("ok"); }
  });
  for (const path of [" https://evil.example/collect", "\thttps://evil.example/collect", "\\\\evil.example/collect"]) {
    await assert.rejects(client.request(path), /configured origin/);
  }
  assert.equal(calls, 0);
  assert.equal(String(client.buildUrl("status")), "https://trusted.example/api/status");
});

test("rejects real redirects without sending tokens to their target", async (t) => {
  const { createServer } = await import("node:http");
  let targetCalls = 0;
  const target = createServer((request, response) => { targetCalls++; response.end("unexpected"); });
  const source = createServer((request, response) => {
    response.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/collect` });
    response.end();
  });
  t.after(async () => {
    await Promise.all([source, target].map((server) => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    })));
  });
  for (const server of [source, target]) {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  }
  const client = new SevenDaysWebApiClient({
    baseUrl: `http://127.0.0.1:${source.address().port}`,
    tokenName: "name", tokenSecret: "synthetic-secret", allowInsecureHttp: true
  });
  await assert.rejects(client.request("api"), (error) => error instanceof SevenDaysApiError && !!error.cause);
  assert.equal(targetCalls, 0);
});

function sseStream(chunks, onCancel) {
  const encoder = new TextEncoder();
  const pending = [...chunks];
  return new ReadableStream({
    pull(controller) {
      if (pending.length) controller.enqueue(encoder.encode(pending.shift()));
      else controller.close();
    },
    cancel: onCancel
  });
}

async function collectSse(chunks) {
  const events = [];
  for await (const event of parseServerSentEvents(sseStream(chunks))) events.push(event);
  return events;
}

test("retains, updates, and clears SSE IDs even on frames without data", async () => {
  assert.deepEqual(await collectSse([
    "id: 42\n\ndata: first\n\nid: ignored\0id\ndata: second\n\nid: 43\ndata: third\n\nid:\n\ndata: fourth\n\n"
  ]), [
    { event: "message", data: "first", id: "42" },
    { event: "message", data: "second", id: "42" },
    { event: "message", data: "third", id: "43" },
    { event: "message", data: "fourth", id: "" }
  ]);
});

test("handles every chunk split of CRLF and standalone CR frames", async () => {
  for (const text of ["data: a\r\ndata: b\r\n\r\n", "data: a\rdata: b\r\r", "data: a\r\ndata: b\n\n"]) {
    for (let split = 1; split < text.length; split++) {
      assert.deepEqual(await collectSse([text.slice(0, split), text.slice(split)]), [
        { event: "message", data: "a\nb" }
      ]);
    }
  }
});

test("discards incomplete SSE events at EOF while retaining complete events", async () => {
  for (const partial of ["data: partial", "data: partial\n", "data: partial\r", "data: partial\r\n"]) {
    assert.deepEqual(await collectSse(["data: complete\n\n", partial]), [
      { event: "message", data: "complete" }
    ]);
  }
});

test("abort interrupts a pending SSE read and preserves the reason", async () => {
  const controller = new AbortController();
  const reason = new Error("test abort");
  let cancelled = false;
  const stream = new ReadableStream({ cancel(value) { cancelled = true; assert.equal(value, reason); } });
  const iterator = parseServerSentEvents(stream, { signal: controller.signal });
  const pending = iterator.next();
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("abort prevents buffered events from being yielded", async () => {
  const controller = new AbortController();
  const stream = sseStream(["data: first\n\ndata: second\n\n"]);
  const iterator = parseServerSentEvents(stream, { signal: controller.signal });
  assert.equal((await iterator.next()).value.data, "first");
  controller.abort();
  await assert.rejects(iterator.next(), (error) => error === controller.signal.reason);
  assert.equal(stream.locked, false);
});

test("cancels unfinished SSE streams on early exit but not normal EOF", async () => {
  let cancellations = 0;
  const early = sseStream(["data: first\n\n", "data: second\n\n"], () => cancellations++);
  for await (const event of parseServerSentEvents(early)) { assert.equal(event.data, "first"); break; }
  assert.equal(cancellations, 1);
  assert.equal(early.locked, false);
  const complete = sseStream(["data: first\n\n"], () => cancellations++);
  for await (const event of parseServerSentEvents(complete)) assert.equal(event.data, "first");
  assert.equal(cancellations, 1);
  assert.equal(complete.locked, false);
});
