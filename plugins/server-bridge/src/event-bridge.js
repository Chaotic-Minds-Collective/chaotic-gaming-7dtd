import { parseServerSentEvents } from "./sse.js";
import { openServerEventStream } from "./stream.js";

const ALLOWED_EVENT_TYPES = new Set([
  "player.joined",
  "player.left",
  "player.chat",
  "server.started",
  "server.stopped",
  "player.died",
]);

function parsePayload(data) {
  if (!data) return {};
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : { value: parsed };
  } catch {
    return { message: data };
  }
}

/**
 * Forward only explicitly mapped provider events. Source event names must be
 * configured from the target server's own OpenAPI/SSE documentation.
 */
export async function bridgeServerEvents({
  apiClient,
  endpoint,
  eventMap,
  publisher,
  spool,
  signal,
  onSkipped = () => {},
}) {
  const stream = await openServerEventStream(apiClient, endpoint, { signal });
  for await (const sourceEvent of parseServerSentEvents(stream, { signal })) {
    const eventType = eventMap[sourceEvent.event];
    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
      onSkipped({ reason: "unmapped_event", sourceType: sourceEvent.event });
      continue;
    }
    if (!sourceEvent.id) {
      onSkipped({ reason: "missing_event_id", sourceType: sourceEvent.event });
      continue;
    }

    const payload = parsePayload(sourceEvent.data);
    const occurredAt = typeof payload.occurredAt === "string" && !Number.isNaN(Date.parse(payload.occurredAt))
      ? payload.occurredAt
      : new Date().toISOString();

    await spool.enqueue({
      eventId: sourceEvent.id,
      eventType,
      occurredAt,
      payload,
    });
    await spool.flush((event) => publisher.publish(event));
  }
}
