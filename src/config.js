require("dotenv").config();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("replace-")) throw new Error(`${name} must be configured.`);
  return value;
}

const coreApiUrl = new URL(required("CORE_API_URL"));
if (!["http:", "https:"].includes(coreApiUrl.protocol)) throw new Error("CORE_API_URL must use HTTP or HTTPS.");
if (process.env.NODE_ENV === "production" && coreApiUrl.protocol !== "https:") {
  throw new Error("CORE_API_URL must use HTTPS in production.");
}
const serviceToken = required("CORE_API_SERVICE_TOKEN");
if (!/^cg_srv_[A-Za-z0-9_-]{40,}$/.test(serviceToken)) throw new Error("CORE_API_SERVICE_TOKEN is invalid.");
const serverId = required("CORE_SERVER_ID");
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(serverId)) {
  throw new Error("CORE_SERVER_ID must be a valid UUID.");
}
const queryHost = required("GAME_SERVER_HOST");
const queryPort = Number(required("GAME_QUERY_PORT"));
if (!Number.isInteger(queryPort) || queryPort < 1 || queryPort > 65535) {
  throw new Error("GAME_QUERY_PORT must be an integer from 1 to 65535.");
}
const intervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS || 60000);
if (!Number.isInteger(intervalMs) || intervalMs < 30000 || intervalMs > 300000) {
  throw new Error("HEARTBEAT_INTERVAL_MS must be between 30000 and 300000.");
}
module.exports = {
  coreApiUrl: coreApiUrl.toString(), serviceToken, serverId, queryHost, queryPort,
  serverVersion: (process.env.GAME_SERVER_VERSION || "unknown").slice(0, 100), intervalMs
};
