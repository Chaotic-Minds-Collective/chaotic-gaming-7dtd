/**
 * Minimal 7 Days to Die Web API client.
 * Endpoint paths are deliberately supplied by callers because the running
 * server's OpenAPI document is authoritative for its exact game build.
 */
export class SevenDaysApiError extends Error {
  constructor(message, { status = null, payload = null, cause = undefined } = {}) {
    super(message, { cause });
    this.name = "SevenDaysApiError";
    this.status = status;
    this.payload = payload;
  }
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be a valid absolute URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("baseUrl must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new TypeError("Do not embed credentials in baseUrl");
  }
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url;
}

export class SevenDaysWebApiClient {
  constructor({
    baseUrl,
    tokenName,
    tokenSecret,
    timeoutMs = 10_000,
    allowInsecureHttp = false,
    fetchImpl = globalThis.fetch
  }) {
    if (!baseUrl) throw new TypeError("baseUrl is required");
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
      throw new TypeError("timeoutMs must be an integer between 1 and 120000");
    }

    if (typeof allowInsecureHttp !== "boolean") {
      throw new TypeError("allowInsecureHttp must be a boolean");
    }
    this.allowInsecureHttp = allowInsecureHttp;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.tokenName = tokenName;
    this.tokenSecret = tokenSecret;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  buildUrl(path) {
    if (typeof path !== "string" || !path.trim()) {
      throw new TypeError("path must be a non-empty relative API path");
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) {
      throw new TypeError("absolute URLs are not allowed");
    }
    const cleanPath = path.replace(/^\/+/, "");
    if (cleanPath.split("/").some((part) => part === "..")) {
      throw new TypeError("path traversal is not allowed");
    }
    const url = new URL(cleanPath, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new TypeError("resolved URL must stay on the configured origin");
    }
    return url;
  }

  buildHeaders(extraHeaders = {}) {
    const headers = new Headers(extraHeaders);
    if (this.tokenName || this.tokenSecret) {
      if (!this.tokenName || !this.tokenSecret) {
        throw new TypeError("Both tokenName and tokenSecret are required for API token authentication");
      }
      // The game API uses named token headers, not HTTP Basic/Bearer auth.
      headers.set("X-SDTD-API-TOKENNAME", this.tokenName);
      headers.set("X-SDTD-API-SECRET", this.tokenSecret);
    }
    return headers;
  }

  async request(path, { method = "GET", body, headers = {}, signal } = {}) {
    const url = this.buildUrl(path);
    const requestHeaders = this.buildHeaders(headers);
    if (url.protocol === "http:" && !this.allowInsecureHttp &&
        (requestHeaders.has("X-SDTD-API-TOKENNAME") || requestHeaders.has("X-SDTD-API-SECRET"))) {
      throw new TypeError("API token headers require HTTPS; allowInsecureHttp is for development only");
    }
    let requestBody = body;

    if (body !== undefined && body !== null && typeof body !== "string" && !(body instanceof ArrayBuffer)) {
      requestHeaders.set("content-type", "application/json");
      requestBody = JSON.stringify(body);
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        redirect: "error",
        signal: combinedSignal
      });
    } catch (cause) {
      throw new SevenDaysApiError("7 Days to Die Web API request failed", { cause });
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      throw new SevenDaysApiError(
        `7 Days to Die Web API returned HTTP ${response.status}`,
        { status: response.status, payload }
      );
    }
    return payload;
  }
}
