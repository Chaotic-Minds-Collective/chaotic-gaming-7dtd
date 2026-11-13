import { SevenDaysApiError } from "./client.js";

/**
 * Open a Server-Sent Events endpoint documented by the exact running server.
 * The connection timeout applies only until response headers arrive; the
 * returned stream remains open until the caller aborts or the server closes it.
 */
export async function openServerEventStream(client, path, { signal, lastEventId } = {}) {
  if (!client || typeof client.buildUrl !== "function" || typeof client.buildHeaders !== "function") {
    throw new TypeError("A SevenDaysWebApiClient instance is required.");
  }

  const url = client.buildUrl(path);
  const headers = client.buildHeaders();
  if (url.protocol === "http:" && !client.allowInsecureHttp &&
      (headers.has("X-SDTD-API-TOKENNAME") || headers.has("X-SDTD-API-SECRET"))) {
    throw new TypeError("API token headers require HTTPS; allowInsecureHttp is for development only");
  }
  if (lastEventId) headers.set("Last-Event-ID", lastEventId);

  const connectionController = new AbortController();
  const connectionTimer = setTimeout(() => connectionController.abort(), client.timeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([signal, connectionController.signal])
    : connectionController.signal;

  let response;
  try {
    response = await client.fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: combinedSignal,
    });
  } catch (cause) {
    throw new SevenDaysApiError("7 Days to Die event stream request failed", { cause });
  } finally {
    clearTimeout(connectionTimer);
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // Preserve the HTTP validation error if cleanup fails.
    }
    throw new SevenDaysApiError(
      `7 Days to Die event stream returned HTTP ${response.status}`,
      { status: response.status }
    );
  }
  if (!response.body) {
    throw new SevenDaysApiError("7 Days to Die event stream returned no response body.");
  }
  return response.body;
}
