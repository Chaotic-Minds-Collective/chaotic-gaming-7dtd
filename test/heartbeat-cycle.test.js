import test from "node:test";
import assert from "node:assert/strict";
import { runHeartbeatCycle } from "../src/core/heartbeat-cycle.js";

test("a failed Telnet probe skips heartbeat instead of falsely marking the server offline", async () => {
  let published = false;
  const warnings = [];
  const result = await runHeartbeatCycle({
    probe: async () => { throw new Error("connection timed out"); },
    publish: async () => { published = true; },
    logger: { warn: (error) => warnings.push(error.message), error() {} },
  });

  assert.deepEqual(result, { sent: false, reason: "probe_failed" });
  assert.equal(published, false);
  assert.deepEqual(warnings, ["connection timed out"]);
});

test("a successful probe publishes the observed server state", async () => {
  let published;
  const observation = { online: true, playerCount: 4 };
  const result = await runHeartbeatCycle({
    probe: async () => observation,
    publish: async (value) => { published = value; },
    logger: { warn() {}, error() {} },
  });

  assert.equal(result.sent, true);
  assert.equal(published, observation);
});

test("a Core publishing failure is reported separately from a probe failure", async () => {
  const errors = [];
  const result = await runHeartbeatCycle({
    probe: async () => ({ online: true }),
    publish: async () => { throw new Error("Core returned 503"); },
    logger: { warn() {}, error: (error) => errors.push(error.message) },
  });

  assert.deepEqual(result, { sent: false, reason: "publish_failed" });
  assert.deepEqual(errors, ["Core returned 503"]);
});
