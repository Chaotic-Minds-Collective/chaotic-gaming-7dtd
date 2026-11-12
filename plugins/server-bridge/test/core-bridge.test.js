import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SevenDaysWebApiClient } from "../src/client.js";
import { openServerEventStream } from "../src/stream.js";
import { CoreEventPublisher } from "../src/core-publisher.js";
import { bridgeServerEvents } from "../src/event-bridge.js";
import { DurableEventSpool } from "../src/event-spool.js";
import { EventCursor } from "../src/event-cursor.js";

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

test("SSE response streams stay open after the connection timeout elapses", async () => {
  const client = new SevenDaysWebApiClient({
    baseUrl: "https://server.example.test/",
    tokenName: "bridge",
    tokenSecret: "synthetic-secret",
    timeoutMs: 20,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode("data: still-open\n\n"));
          controller.close();
        }, 80);
      },
    }), { status: 200 }),
  });
  const stream = await openServerEventStream(client, "/events");
  await new Promise((resolve) => setTimeout(resolve, 50));
  const reader = stream.getReader();
  const result = await reader.read();
  assert.match(new TextDecoder().decode(result.value), /still-open/);
});

test("sends Last-Event-ID when resuming an SSE stream", async () => {
  let capturedHeaders;
  const client = new SevenDaysWebApiClient({
    baseUrl: "https://server.example.test/",
    tokenName: "bridge",
    tokenSecret: "synthetic-secret",
    fetchImpl: async (_url, options) => {
      capturedHeaders = options.headers;
      return new Response(new ReadableStream({ start(controller) { controller.close(); } }), { status: 200 });
    },
  });
  await openServerEventStream(client, "/events", { lastEventId: "event-123" });
  assert.equal(capturedHeaders.get("Last-Event-ID"), "event-123");
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

test("resolves a verified Steam identity through the server-scoped Core endpoint", async () => {
  let captured;
  const publisher = new CoreEventPublisher({
    baseUrl: "https://core.example.test",
    serviceToken: "synthetic-service-token",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ data: { linked: true, principalId: "player-1", username: "player" } }), { status: 200 });
    },
  });
  const result = await publisher.resolvePlayer("steam", "76561198000000000");
  assert.equal(result.data.linked, true);
  assert.equal(result.data.principalId, "player-1");
  assert.match(captured.url, /\/players\/resolve$/);
  assert.equal(JSON.parse(captured.options.body).externalId, "76561198000000000");
});

test("maps a configured source event and resolves its verified player identity", async () => {
  const sourcePayload = {
    id: "source-player-event-1",
    event: "PlayerJoined",
    data: JSON.stringify({ player: { steamId: "76561198000000000" }, occurredAt: "2026-11-12T16:00:00.000Z" }),
  };
  const sseText = "id: " + sourcePayload.id + "\nevent: " + sourcePayload.event + "\ndata: " + sourcePayload.data + "\n\n";
  const apiClient = new SevenDaysWebApiClient({
    baseUrl: "https://server.example.test/",
    tokenName: "bridge",
    tokenSecret: "synthetic-secret",
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseText));
        controller.close();
      },
    }), { status: 200 }),
  });
  const delivered = [];
  const queued = [];
  const publisher = {
    resolvePlayer: async (provider, externalId) => ({
      data: { linked: true, provider, externalId, principalId: "player-1" },
    }),
    publish: async (event) => delivered.push(event),
  };
  const spool = {
    enqueue: async (event) => queued.push(event),
    flush: async (publish) => {
      for (const event of queued.splice(0)) await publish(event);
      return { delivered: delivered.length, pending: 0 };
    },
  };
  let savedCursor;
  const cursor = await bridgeServerEvents({
    apiClient,
    endpoint: "/events",
    eventMap: {
      PlayerJoined: { type: "player.joined", provider: "steam", playerIdField: "player.steamId" },
    },
    publisher,
    spool,
    saveCursor: async (value) => { savedCursor = value; },
  });

  assert.equal(cursor, "source-player-event-1");
  assert.equal(savedCursor, "source-player-event-1");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].payload.chaoticGamingPlayer.principalId, "player-1");
});

test("requires a provider event ID and allowlisted normalized event type", async () => {
  const publisher = new CoreEventPublisher({
    baseUrl: "https://core.example.test",
    serviceToken: "synthetic-service-token",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
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

test("persists the last acknowledged provider event cursor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cg-event-cursor-"));
  const filePath = join(directory, "last-event-id.txt");
  try {
    const cursor = new EventCursor(filePath);
    assert.equal(await cursor.load(), undefined);
    await cursor.save("event-123");
    assert.equal(await cursor.load(), "event-123");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

