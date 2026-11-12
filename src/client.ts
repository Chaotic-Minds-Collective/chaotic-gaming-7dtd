import type { SdtDConfig } from "./config.js";

export interface SdtDRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class SdtDHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SdtDHttpError";
  }
}

export class SdtDClient {
  constructor(
    private readonly config: SdtDConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request<T>(path: string, options: SdtDRequestOptions = {}): Promise<T> {
    const url = this.resolvePath(path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (this.config.tokenName && this.config.tokenSecret) {
      headers.set("X-SDTD-API-TOKENNAME", this.config.tokenName);
      headers.set("X-SDTD-API-SECRET", this.config.tokenSecret);
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    const timeout = AbortSignal.timeout(this.config.requestTimeoutMs);
    const signal = options.signal
      ? AbortSignal.any([timeout, options.signal])
      : timeout;

    const response = await this.fetchImpl(url, {
      method: options.method ?? "GET",
      headers,
      ...(body === undefined ? {} : { body }),
      signal,
    });

    if (!response.ok) {
      throw new SdtDHttpError(
        `7 Days to Die API request failed with HTTP ${response.status}`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async openEventStream(path: string, signal?: AbortSignal): Promise<Response> {
    const url = this.resolvePath(path);
    const headers = new Headers({ Accept: "text/event-stream" });
    if (this.config.tokenName && this.config.tokenSecret) {
      headers.set("X-SDTD-API-TOKENNAME", this.config.tokenName);
      headers.set("X-SDTD-API-SECRET", this.config.tokenSecret);
    }

    // SSE is intentionally long-lived: the caller owns cancellation/reconnection.
    const response = await this.fetchImpl(url, {
      headers,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw new SdtDHttpError(
        `7 Days to Die event stream failed with HTTP ${response.status}`,
        response.status,
      );
    }
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      throw new Error("7 Days to Die event stream did not return text/event-stream");
    }
    return response;
  }

  private resolvePath(path: string): URL {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error("API paths must be absolute paths on the configured server");
    }
    const url = new URL(path, this.config.baseUrl);
    if (url.origin !== this.config.baseUrl.origin) {
      throw new Error("API path escaped the configured server origin");
    }
    return url;
  }
}
