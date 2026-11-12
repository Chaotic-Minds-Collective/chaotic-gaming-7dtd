const test = require("node:test");
const assert = require("node:assert/strict");
const { createHeartbeatAgent } = require("../src/heartbeat");

const baseConfig = {
  coreApiUrl: "https://core.example.test",
  serviceToken: "cg_srv_" + "a".repeat(48),
  serverId: "11111111-1111-4111-8111-111111111111",
  queryHost: "127.0.0.1",
  queryPort: 27015,
  serverVersion: "test-build",
  intervalMs: 60000
};

test("7 Days to Die heartbeat sends authenticated status to the assigned Core server", async () => {
  let request;
  const agent = createHeartbeatAgent({
    game: "7dtd", adapterVersion: "0.1.0", config: baseConfig,
    queryServer: async () => ({ version: "test-build", players: [{ name: "One" }, { name: "Two" }] }),
    fetchImpl: async (url, options) => { request = { url: String(url), options }; return { ok: true, status: 202 }; },
    logger: { warn() {}, error() {} }
  });
  const result = await agent.reportOnce();
  assert.equal(result.sent, true);
  assert.equal(request.url, "https://core.example.test/integrations/servers/11111111-1111-4111-8111-111111111111/heartbeat");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, `Bearer ${baseConfig.serviceToken}`);
  const body = JSON.parse(request.options.body);
  assert.equal(body.game, "7dtd");
  assert.equal(body.online, true);
  assert.equal(body.playerCount, 2);
  assert.equal(body.adapterVersion, "0.1.0");
});

test("query failure skips heartbeat rather than falsely reporting the server offline", async () => {
  let requests = 0;
  const agent = createHeartbeatAgent({
    game: "7dtd", adapterVersion: "0.1.0", config: baseConfig,
    queryServer: async () => { throw new Error("query timed out"); },
    fetchImpl: async () => { requests += 1; return { ok: true, status: 202 }; },
    logger: { warn() {}, error() {} }
  });
  const result = await agent.reportOnce();
  assert.deepEqual(result, { sent: false, reason: "game_query_failed" });
  assert.equal(requests, 0);
});

test("Core API rejection is surfaced to the caller", async () => {
  const agent = createHeartbeatAgent({
    game: "7dtd", adapterVersion: "0.1.0", config: baseConfig,
    queryServer: async () => ({ players: [] }),
    fetchImpl: async () => ({ ok: false, status: 403 }),
    logger: { warn() {}, error() {} }
  });
  await assert.rejects(agent.reportOnce(), /HTTP 403/);
});
