import "dotenv/config";
import { SevenDaysWebApiClient } from "./client.js";
import { CoreEventPublisher } from "./core-publisher.js";
import { DurableEventSpool } from "./event-spool.js";
import { bridgeServerEvents } from "./event-bridge.js";

const required = [
  "SDTD_API_URL",
  "SDTD_API_TOKEN_NAME",
  "SDTD_API_TOKEN_SECRET",
  "SDTD_SSE_ENDPOINT",
  "CORE_API_BASE_URL",
  "CORE_API_SERVICE_TOKEN",
  "CORE_SERVER_ID",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

let eventMap;
try {
  eventMap = JSON.parse(process.env.SDTD_EVENT_MAP || "{}");
} catch {
  throw new Error("SDTD_EVENT_MAP must be valid JSON.");
}
if (!eventMap || typeof eventMap !== "object" || Array.isArray(eventMap)) {
  throw new Error("SDTD_EVENT_MAP must be a JSON object.");
}

const apiClient = new SevenDaysWebApiClient({
  baseUrl: process.env.SDTD_API_URL,
  tokenName: process.env.SDTD_API_TOKEN_NAME,
  tokenSecret: process.env.SDTD_API_TOKEN_SECRET,
  allowInsecureHttp: process.env.SDTD_ALLOW_INSECURE_HTTP === "true",
});
const publisher = new CoreEventPublisher({
  baseUrl: process.env.CORE_API_BASE_URL,
  serviceToken: process.env.CORE_API_SERVICE_TOKEN,
  serverId: process.env.CORE_SERVER_ID,
});
const spool = new DurableEventSpool(process.env.CORE_EVENT_SPOOL_PATH || "./data/core-events.jsonl");

const controller = new AbortController();
process.on("SIGINT", () => controller.abort(new Error("SIGINT")));
process.on("SIGTERM", () => controller.abort(new Error("SIGTERM")));

let retryMs = 1_000;
while (!controller.signal.aborted) {
  try {
    const flushed = await spool.flush((event) => publisher.publish(event));
    if (flushed.pending > 0) {
      console.warn(`[7DTD Bridge] ${flushed.pending} event(s) remain queued for Core.`);
    }

    await bridgeServerEvents({
      apiClient,
      endpoint: process.env.SDTD_SSE_ENDPOINT,
      eventMap,
      publisher,
      spool,
      signal: controller.signal,
      onSkipped: (info) => console.warn("[7DTD Bridge] Event skipped:", info.reason, info.sourceType),
    });
    retryMs = 1_000;
  } catch (error) {
    if (controller.signal.aborted) break;
    console.error("[7DTD Bridge] Stream interrupted; reconnecting:", error.message);
    await new Promise((resolve) => setTimeout(resolve, retryMs));
    retryMs = Math.min(retryMs * 2, 30_000);
  }
}
