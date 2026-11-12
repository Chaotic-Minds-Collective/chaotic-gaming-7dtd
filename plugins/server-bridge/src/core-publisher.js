const ALLOWED_EVENT_TYPES = new Set([
  "player.joined",
  "player.left",
  "player.chat",
  "server.started",
  "server.stopped",
  "player.died",
]);
const SERVER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENT_BYTES = 900_000;

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
    if (typeof baseUrl !== "string" || !baseUrl.trim() ||
        typeof serviceToken !== "string" || !serviceToken.trim() ||
        typeof serverId !== "string" || !SERVER_UUID.test(serverId)) {
      throw new TypeError("A Core URL, service token, and valid server UUID are required.");
    }
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
      throw new TypeError("timeoutMs must be an integer between 100 and 120000.");
    }

    const parsed = new URL(baseUrl);
    const localHttp = parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.username || parsed.password) {
      throw new TypeError("Do not embed credentials in CORE_API_BASE_URL.");
    }
    if (parsed.protocol !== "https:" && !localHttp) {
      throw new TypeError("Core API must use HTTPS outside loopback development.");
    }

    this.baseUrl = parsed.origin;
    this.serviceToken = serviceToken;
    this.serverId = serverId;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async resolvePlayer(provider, externalId) {
    if (typeof provider !== "string" || !/^[a-z0-9._-]{2,32}$/.test(provider)) {
      throw new TypeError("A valid external identity provider is required.");
    }
    if (typeof externalId !== "string" || externalId.length < 1 || externalId.length > 128) {
      throw new TypeError("A valid external player ID is required.");
    }

    const response = await this.fetchImpl(
      new URL(`/integrations/servers/${encodeURIComponent(this.serverId)}/players/resolve`, this.baseUrl),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.serviceToken}`,
        },
        body: JSON.stringify({ provider, externalId }),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      }
    );
    if (!response.ok) {
      throw new CorePublisherError(`Core rejected player identity resolution (HTTP ${response.status}).`, {
        status: response.status,
        code: response.status === 403 ? "CORE_FORBIDDEN" : "CORE_IDENTITY_RESOLUTION_FAILED",
      });
    }
    return response.json();
  }

  async publish(event) {
    if (!event || typeof event.eventId !== "string" || !event.eventId.trim() || event.eventId.length > 200) {
      throw new TypeError("A provider event ID is required for idempotent publishing.");
    }
    if (!ALLOWED_EVENT_TYPES.has(event.eventType)) {
      throw new TypeError("Unsupported normalized game event type.");
    }
    const occurredAt = new Date(event.occurredAt);
    if (!event.occurredAt || Number.isNaN(occurredAt.getTime())) {
      throw new TypeError("A valid event timestamp is required.");
    }
    const payload = event.payload ?? {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("Event payload must be an object.");
    }

    const body = {
      game: "7dtd",
      eventId: event.eventId.trim(),
      eventType: event.eventType,
      occurredAt: occurredAt.toISOString(),
      payload,
    };
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_EVENT_BYTES) {
      throw new TypeError("Normalized event exceeds the maximum Core API payload size.");
    }

    let response;
    try {
      response = await this.fetchImpl(
        new URL(`/integrations/servers/${encodeURIComponent(this.serverId)}/events`, this.baseUrl),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.serviceToken}`,
          },
          body: JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(this.timeoutMs),
        }
      );
    } catch {
      throw new CorePublisherError("Core event publishing failed or timed out.", {
        code: "CORE_REQUEST_FAILED",
      });
    }

    if (!response.ok) {
      throw new CorePublisherError(`Core rejected the event (HTTP ${response.status}).`, {
        status: response.status,
        code: response.status === 403 ? "CORE_FORBIDDEN" : "CORE_REJECTED_EVENT",
      });
    }
    return response.json();
  }
}
