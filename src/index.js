const { GameDig } = require("gamedig");
const config = require("./config");
const { createHeartbeatAgent } = require("./heartbeat");

const agent = createHeartbeatAgent({
  game: "7dtd",
  adapterVersion: "0.1.0",
  config,
  queryServer: ({ host, port }) => GameDig.query({
    type: "7d2d",
    host,
    port,
    maxAttempts: 2
  })
});

agent.start();
console.info("[7dtd] Core heartbeat agent started.");

function shutdown(signal) {
  console.info(`[7dtd] Stopping heartbeat agent (${signal}).`);
  agent.stop();
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
