import test from "node:test";
import assert from "node:assert/strict";
import { CoreEventPublisher } from "../src/core-publisher.js";

const validConfig = {
  baseUrl: "https://core.example.test",
  serviceToken: "synthetic-service-token",
  serverId: "123e4567-e89b-42d3-a456-426614174000",
};

test("Core publisher requires a valid server UUID and secure URL", () => {
  assert.throws(() => new CoreEventPublisher({ ...validConfig, serverId: "not-a-uuid" }), /valid server UUID/);
  assert.throws(() => new CoreEventPublisher({ ...validConfig, baseUrl: "http://remote.example" }), /HTTPS/);
  assert.throws(() => new CoreEventPublisher({ ...validConfig, baseUrl: "https://user:pass@core.example.test" }), /Do not embed credentials/);
});

test("Core publisher normalizes timestamps and rejects oversized or invalid payloads", async () => {
  let requestBody;
  const publisher = new CoreEventPublisher({
    ...validConfig,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ data: { accepted: true } }), { status: 202 });
    },
  });

  await publisher.publish({
    eventId: " event-42 ",
    eventType: "player.joined",
    occurredAt: "2026-11-12T16:00:00-08:00",
    payload: { externalPlayerId: "steam-42" },
  });
  assert.equal(requestBody.eventId, "event-42");
  assert.equal(requestBody.occurredAt, "2026-11-13T00:00:00.000Z");

  await assert.rejects(
    publisher.publish({
      eventId: "event-large",
      eventType: "player.chat",
      occurredAt: new Date().toISOString(),
      payload: { message: "x".repeat(910_000) },
    }),
    /maximum Core API payload size/,
  );
  await assert.rejects(
    publisher.publish({
      eventId: "event-array",
      eventType: "player.joined",
      occurredAt: new Date().toISOString(),
      payload: [],
    }),
    /payload must be an object/,
  );
});

test("Core event publisher does not expose service credentials on network failures", async () => {
  const publisher = new CoreEventPublisher({
    ...validConfig,
    fetchImpl: async () => { throw new Error("network failed"); },
  });
  await assert.rejects(
    publisher.publish({
      eventId: "event-1",
      eventType: "player.joined",
      occurredAt: new Date().toISOString(),
      payload: {},
    }),
    (error) => error.code === "CORE_REQUEST_FAILED" && !error.message.includes("synthetic-service-token"),
  );
});
