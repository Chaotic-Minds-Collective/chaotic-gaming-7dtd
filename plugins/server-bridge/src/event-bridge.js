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

function readPath(value, path) {
  if (typeof path !== "string" || !path.trim()) return undefined;
  return path.split(".").reduce((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return current[key];
  }, value);
}

/**
 * Forward only explicitly mapped provider events. Source event names and player
 * ID paths must be configured from the target server's own OpenAPI/SSE docs.
 */
export async function bridgeServerEvents({
  apiClient,
  endpoint,
  eventMap,
  publisher,
  spool,
  signal,
  lastEventId,
  saveCursor = async () => {},
  onSkipped = () => {},
  onIdentityResolutionError = () => {},
}) {
  const stream = await openServerEventStream(apiClient, endpoint, { signal, lastEventId });
  let cursor = lastEventId;
  for await (const sourceEvent of parseServerSentEvents(stream, { signal })) {
    const mapping = eventMap[sourceEvent.event];
    const eventType = typeof mapping === "string" ? mapping : mapping?.type;
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

    if (
      mapping && typeof mapping === "object"
      && mapping.provider && mapping.playerIdField
      && eventType.startsWith("player.")
      && typeof publisher.resolvePlayer === "function"
    ) {
      const externalId = readPath(payload, mapping.playerIdField);
      if (typeof externalId === "string" && externalId.length > 0 && externalId.length <= 128) {
        try {
          const resolution = await publisher.resolvePlayer(mapping.provider, externalId);
          payload.chaoticGamingPlayer = resolution.data ?? resolution;
        } catch (error) {
          payload.identityResolutionStatus = "unavailable";
          onIdentityResolutionError({
            sourceType: sourceEvent.event,
            provider: mapping.provider,
            error: error instanceof Error ? error.message : "Identity resolution failed.",
          });
        }
      } else {
        payload.identityResolutionStatus = "external_id_missing";
        onSkipped({ reason: "external_player_id_missing", sourceType: sourceEvent.event, field: mapping.playerIdField });
      }
    }

    await spool.enqueue({
      eventId: sourceEvent.id,
      eventType,
      occurredAt,
      payload,
    });
    cursor = sourceEvent.id;
    await saveCursor(cursor);
    await spool.flush((event) => publisher.publish(event));
  }
  return cursor;
}
