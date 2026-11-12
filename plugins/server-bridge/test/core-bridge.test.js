import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SevenDaysWebApiClient } from "../src/client.js";
import { openServerEventStream } from "../src/stream.js";
import { CoreEventPublisher } from "../src/core-publisher.js";
import { DurableEventSpool } from "../src/event-spool.js";

test("opens a documented SSE endpoint with named API token headers", async () => {
  let captured;
  const client = new SevenDaysWebApiClient({
    baseUrl: "https://server.example.test/",
    tokenName: "bridge",
    tokenSecret: "synthetic-secret",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(new ReadableStream({ start(controller) { controller.close(); } }), { status: 200 });
    },
  });

  const stream = await openServerEventStream(client, "/api/events");
  assert.equal(typeof stream.getReader, "function");
  assert.equal(captured.url, "https://server.example.test/api/events");
  assert.equal(captured.options.headers.get("X-SDTD-API-TOKENNAME"), "bridge");
  assert.equal(captured.options.headers.get("X-SDTD-API-SECRET"), "synthetic-secret");
  assert.equal(captured.options.redirect, "error");
});

test("rejects token-authenticated event streams over HTTP", async () => {
  const client = new SevenDaysWebApiClient({
    baseUrl: "http://127.0.0.1:8080",
    tokenName: "bridge",
    tokenSecret: "synthetic-secret",
  });
  await assert.rejects(openServerEventStream(client, "/events"), /require HTTPS/);
});

test("publishes normalized events to the server-scoped Core endpoint", async () => {
  let captured;
  const publisher = new CoreEventPublisher({
    baseUrl: "https://core.example.test",
    serviceToken: "synthetic-service-token",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ data: { accepted: true } }), { status: 202 });
    },
  });

  const result = await publisher.publish({
    eventId: "source-42",
    eventType: "player.joined",
    occurredAt: "2026-11-12T16:00:00.000Z",
    payload: { providerPlayerId: "player-7" },
  });
  assert.equal(result.data.accepted, true);
  assert.equal(captured.url, "https://core.example.test/integrations/servers/123e4567-e89b-42d3-a456-426614174000/events");
  assert.equal(captured.options.headers.Authorization, "Bearer synthetic-service-token");
  assert.equal(JSON.parse(captured.options.body).eventId, "source-42");
});

test("requires a provider event ID and allowlisted normalized event type", async () => {
  const publisher = new CoreEventPublisher({
    baseUrl: "https://core.example.test",
    serviceToken: "synthetic-service-token",
    serverId: "server",
    fetchImpl: async () => new Response("{}", { status: 202 }),
  });
  await assert.rejects(publisher.publish({ eventType: "player.joined", occurredAt: new Date().toISOString() }), /provider event ID/);
  await assert.rejects(publisher.publish({ eventId: "42", eventType: "admin.execute", occurredAt: new Date().toISOString() }), /Unsupported normalized/);
});

test("durably queues events and retains undelivered events on Core failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cg-event-spool-"));
  const filePath = join(directory, "events.jsonl");
  try {
    const spool = new DurableEventSpool(filePath);
    await spool.enqueue({ eventId: "1", eventType: "player.joined", occurredAt: new Date().toISOString(), payload: {} });
    await spool.enqueue({ eventId: "2", eventType: "player.left", occurredAt: new Date().toISOString(), payload: {} });

    const failed = await spool.flush(async () => { throw new Error("Core offline"); });
    assert.deepEqual(failed, { delivered: 0, pending: 2 });

    const retried = await spool.flush(async (event) => {
      if (event.eventId === "1") return;
      throw new Error("Still offline");
    });
    assert.deepEqual(retried, { delivered: 1, pending: 1 });

    const remaining = JSON.parse((await readFile(filePath, "utf8")).trim());
    assert.equal(remaining.eventId, "2");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
