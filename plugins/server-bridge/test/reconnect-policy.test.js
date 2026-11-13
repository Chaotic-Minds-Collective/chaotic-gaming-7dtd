import test from "node:test";
import assert from "node:assert/strict";
import { nextReconnectDelay, waitForReconnect } from "../src/reconnect-policy.js";

test("short-lived stream closures use exponential backoff with a 30-second cap", () => {
  assert.equal(nextReconnectDelay(1_000, 100), 2_000);
  assert.equal(nextReconnectDelay(2_000, 100), 4_000);
  assert.equal(nextReconnectDelay(16_000, 100), 30_000);
  assert.equal(nextReconnectDelay(30_000, 100), 30_000);
});

test("stable streams reset the reconnect delay", () => {
  assert.equal(nextReconnectDelay(30_000, 30_000), 1_000);
  assert.equal(nextReconnectDelay(8_000, 120_000), 1_000);
});

test("reconnect policy rejects invalid timing inputs", () => {
  assert.throws(() => nextReconnectDelay(-1, 10), /non-negative/);
  assert.throws(() => nextReconnectDelay(1_000, 10, { baseDelayMs: 5_000, maxDelayMs: 1_000 }), /bounds/);
});

test("reconnect wait can be cancelled during graceful shutdown", async () => {
  const controller = new AbortController();
  const started = Date.now();
  const pending = waitForReconnect(30_000, controller.signal);
  controller.abort();
  await pending;
  assert.ok(Date.now() - started < 1_000);
});

test("reconnect wait completes immediately when already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await waitForReconnect(30_000, controller.signal);
});
