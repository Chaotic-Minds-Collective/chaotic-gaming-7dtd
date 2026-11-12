const ALLOWED_EVENT_TYPES = new Set([
  "player.joined",
  "player.left",
  "player.chat",
  "server.started",
  "server.stopped",
  "player.died",
]);

export class CorePublisherError extends Error {
  constructor(message, { status = 0, code = "CORE_PUBLISH_FAILED" } = {}) {
    super(message);
    this.name = "CorePublisherError";
    this.status = status;
    this.code = code;
  }
}

export class CoreEventPublisher {
  constructor({ baseUrl, serviceToken, serverId, fetchImpl = globalThis.fetch, timeoutMs = 5_000 }) {
    if (!baseUrl || !serviceToken || !serverId) {
      throw new TypeError("Core URL, service token, and server UUID are required.");
    }
    const parsed = new URL(baseUrl);
    const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHttp) {
      throw new TypeError("Core API must use HTTPS outside localhost.");
    }
    this.baseUrl = parsed.origin;
    this.serviceToken = serviceToken;
    this.serverId = serverId;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async publish(event) {
    if (!event || typeof event.eventId !== "string" || !event.eventId.trim() || event.eventId.length > 200) {
      throw new TypeError("A provider event ID is required for idempotent publishing.");
    }
    if (!ALLOWED_EVENT_TYPES.has(event.eventType)) {
      throw new TypeError("Unsupported normalized game event type.");
    }
    if (!event.occurredAt || Number.isNaN(Date.parse(event.occurredAt))) {
      throw new TypeError("A valid event timestamp is required.");
    }

    const response = await this.fetchImpl(
      new URL(`/integrations/servers/${encodeURIComponent(this.serverId)}/events`, this.baseUrl),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.serviceToken}`,
        },
        body: JSON.stringify({
          game: "7dtd",
          eventId: event.eventId,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          payload: event.payload ?? {},
        }),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      }
    );

    if (!response.ok) {
      throw new CorePublisherError(`Core rejected the event (HTTP ${response.status}).`, {
        status: response.status,
        code: response.status === 403 ? "CORE_FORBIDDEN" : "CORE_REJECTED_EVENT",
      });
    }
    return response.json();
  }
}
