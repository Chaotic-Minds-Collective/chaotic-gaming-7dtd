export async function sendCoreHeartbeat({
  baseUrl,
  serviceToken,
  serverId,
  game = "7dtd",
  serverVersion,
  adapterVersion = "0.1.0",
  online,
  playerCount,
  fetchImpl = globalThis.fetch,
}) {
  if (!baseUrl || !serviceToken || !serverId || !serverVersion) {
    throw new Error("Core URL, service token, server UUID, and server version are required.");
  }

  const parsedBase = new URL(baseUrl);
  const localHttp = parsedBase.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsedBase.hostname);
  if (parsedBase.protocol !== "https:" && !localHttp) {
    throw new Error("Core API must use HTTPS outside localhost.");
  }

  const body = {
    game,
    serverVersion,
    adapterVersion,
    online: Boolean(online),
    observedAt: new Date().toISOString(),
    ...(Number.isInteger(playerCount) && playerCount >= 0 ? { playerCount } : {}),
  };

  const response = await fetchImpl(
    new URL(`/integrations/servers/${encodeURIComponent(serverId)}/heartbeat`, parsedBase.origin),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    }
  );

  if (!response.ok) {
    throw new Error(`Core rejected the server heartbeat (HTTP ${response.status}).`);
  }
  return response.json();
}
