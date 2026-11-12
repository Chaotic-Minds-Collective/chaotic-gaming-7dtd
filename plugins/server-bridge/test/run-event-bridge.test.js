import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { nextReconnectDelay } from "../src/reconnect-policy.js";

// Execute the entry point with deterministic I/O and time, without real services.
const source = (await readFile(new URL("../src/run-event-bridge.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "");

for (const outcome of ["close", "error", "flush error", "stable"]) {
  test(`reconnect timing excludes slow spool flushes: ${outcome}`, async () => {
    let now = 0;
    let controller;
    let attempts = 0;
    const delays = [];
    class Stub {}
    await runInNewContext(`(async () => { ${source} })()`, {
      process: { env: new Proxy({}, { get: (_target, name) => name === "SDTD_EVENT_MAP" ? "{}" : "synthetic" }), once() {} },
      console: { warn() {}, error() {} },
      performance: { now: () => now },
      AbortController: class extends AbortController { constructor() { super(); controller = this; } },
      setInterval: () => 1,
      clearInterval() {},
      SevenDaysWebApiClient: Stub,
      CoreEventPublisher: Stub,
      EventCursor: class { async load() {} },
      DurableEventSpool: class {
        async flush() {
          now += 60_000;
          if (outcome === "flush error") throw new Error("local failure");
          return { pending: 0 };
        }
      },
      bridgeServerEvents: async () => {
        if (outcome === "stable") now += 30_000;
        if (outcome === "error") throw new Error("stream failure");
      },
      nextReconnectDelay,
      waitForReconnect: async delay => {
        delays.push(delay);
        if (++attempts === 3) controller.abort();
      },
    });
    assert.deepEqual(delays, outcome === "stable" ? [1_000, 1_000, 1_000] : [2_000, 4_000, 8_000]);
  });
}
