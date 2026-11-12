export interface SdtDConfig {
  baseUrl: URL;
  tokenName?: string;
  tokenSecret?: string;
  requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SdtDConfig {
  const rawBaseUrl = env.SDTD_BASE_URL ?? "http://127.0.0.1:8080";
  const baseUrl = new URL(rawBaseUrl);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("SDTD_BASE_URL must use HTTP or HTTPS");
  }

  const tokenName = env.SDTD_API_TOKEN_NAME?.trim();
  const tokenSecret = env.SDTD_API_SECRET?.trim();
  if (Boolean(tokenName) !== Boolean(tokenSecret)) {
    throw new Error("Both SDTD_API_TOKEN_NAME and SDTD_API_SECRET must be configured together");
  }

  const requestTimeoutMs = Number(env.SDTD_REQUEST_TIMEOUT_MS ?? 10_000);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 500 || requestTimeoutMs > 120_000) {
    throw new Error("SDTD_REQUEST_TIMEOUT_MS must be an integer between 500 and 120000");
  }

  return {
    baseUrl,
    ...(tokenName && tokenSecret ? { tokenName, tokenSecret } : {}),
    requestTimeoutMs,
  };
}
