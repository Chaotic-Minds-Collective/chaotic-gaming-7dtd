import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CoreEventPublisher } from "../src/core-publisher.js";
import { DurableEventSpool } from "../src/event-spool.js";
import { parseServerSentEvents } from "../src/sse.js";
import { openServerEventStream } from "../src/stream.js";
import { SevenDaysWebApiClient } from "../src/client.js";

const config = { baseUrl: "http://[::1]:8080", serviceToken: "synthetic", serverId: "123e4567-e89b-42d3-a456-426614174000" };
const event = (eventId, message = "") => ({ eventId, eventType: "player.chat", occurredAt: "2026-11-12T00:00:00Z", payload: { message } });

test("quarantines oversized events privately, continues delivery and survives restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "repair-spool-"));
  try {
    const path = join(directory, "events.jsonl");
    const spool = new DurableEventSpool(path);
    const delivered = [];
    const publisher = new CoreEventPublisher({ ...config, fetchImpl: async (_url, options) => {
      delivered.push(JSON.parse(options.body).eventId);
      return new Response("{}");
    } });
    await spool.enqueue(event("large", "x".repeat(910_000)));
    await spool.enqueue(event("valid"));
    assert.deepEqual(await spool.flush(e => publisher.publish(e)), { delivered: 1, pending: 0 });
    assert.deepEqual(delivered, ["valid"]);
    assert.equal(JSON.parse((await readFile(spool.quarantinePath, "utf8")).trim()).eventId, "large");
    assert.equal((await stat(spool.quarantinePath)).mode & 0o777, 0o600);
    assert.deepEqual(await new DurableEventSpool(path).flush(e => publisher.publish(e)), { delivered: 0, pending: 0 });
    // Transport TypeErrors and remote failures must not be mistaken for local validation.
    await spool.enqueue(event("retry"));
    assert.deepEqual(await spool.flush(async () => { throw new TypeError("network"); }), { delivered: 0, pending: 1 });
    assert.deepEqual(await spool.flush(async () => { throw new Error("HTTP 400"); }), { delivered: 0, pending: 1 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed quarantine persistence retains the original pending event", async () => {
  const directory = await mkdtemp(join(tmpdir(), "repair-spool-"));
  try {
    const spool = new DurableEventSpool(join(directory, "events.jsonl"));
    await spool.enqueue(event("large", "x".repeat(910_000)));
    await mkdir(spool.quarantinePath);
    const publisher = new CoreEventPublisher(config);
    await assert.rejects(spool.flush(e => publisher.publish(e)));
    assert.equal(JSON.parse((await readFile(spool.filePath, "utf8")).trim()).eventId, "large");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("SSE handles every split of mixed CRLF, CR and LF delimiters", async () => {
  const input = "data: x\r\n\r\ndata: y\r\rdata: z\n\n";
  for (let split = 0; split <= input.length; split++) {
    const stream = new ReadableStream({ start(c) {
      c.enqueue(new TextEncoder().encode(input.slice(0, split)));
      c.enqueue(new TextEncoder().encode(input.slice(split)));
      c.close();
    } });
    const messages = [];
    for await (const message of parseServerSentEvents(stream)) messages.push(message.data);
    assert.deepEqual(messages, ["x", "y", "z"]);
  }
});

test("SSE bounds unterminated lines and accumulated data and cancels on rejection", async () => {
  for (const chunks of [["abcdef"], ["data: ab\n", "data: cd\n"]]) {
    let cancelled = false;
    const stream = new ReadableStream({ start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
    }, cancel() { cancelled = true; } });
    await assert.rejects(async () => {
      for await (const _message of parseServerSentEvents(stream, { maxLineLength: chunks.length === 1 ? 5 : 100, maxEventLength: 5 })) {}
    }, /exceeds maximum length/);
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false);
  }
});

test("rejected SSE responses cancel bodies and preserve HTTP errors if cancellation fails", async () => {
  for (const fails of [false, true]) {
    let cancelled = false;
    const client = new SevenDaysWebApiClient({ baseUrl: "https://game.example", fetchImpl: async () => ({
      ok: false, status: 403, body: { async cancel() { cancelled = true; if (fails) throw new Error("cleanup"); } }
    }) });
    await assert.rejects(openServerEventStream(client, "events"), /HTTP 403/);
    assert.equal(cancelled, true);
  }
});
