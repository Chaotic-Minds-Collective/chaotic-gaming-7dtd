import "dotenv/config";
import { SevenDaysTelnetClient } from "./telnet/client.js";
import { sendCoreHeartbeat } from "./core/heartbeat.js";

const required = ["CORE_API_BASE_URL", "CORE_API_SERVICE_TOKEN", "CORE_SERVER_ID", "GAME_SERVER_VERSION", "TELNET_HOST", "TELNET_PASSWORD"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const port = Number(process.env.TELNET_PORT || 8081);
const intervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 120_000);
if (!Number.isInteger(intervalMs) || intervalMs < 30_000) {
  throw new Error("HEARTBEAT_INTERVAL_MS must be at least 30000.");
}

const telnet = new SevenDaysTelnetClient({
  host: process.env.TELNET_HOST,
  port,
  password: process.env.TELNET_PASSWORD,
});

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

while (!stopping) {
  let online = false;
  try {
    const response = await telnet.execute("gettime");
    online = response.length > 0;
  } catch (error) {
    console.warn("[7DTD] Telnet health check failed:", error.message);
  }

  try {
    await sendCoreHeartbeat({
      baseUrl: process.env.CORE_API_BASE_URL,
      serviceToken: process.env.CORE_API_SERVICE_TOKEN,
      serverId: process.env.CORE_SERVER_ID,
      serverVersion: process.env.GAME_SERVER_VERSION,
      adapterVersion: process.env.ADAPTER_VERSION || "0.1.0",
      online,
    });
    console.info(`[7DTD] Core heartbeat submitted (online=${online}).`);
  } catch (error) {
    console.error("[7DTD] Core heartbeat failed:", error.message);
  }

  if (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
