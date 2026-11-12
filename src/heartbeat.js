const REQUEST_TIMEOUT_MS = 8000;

function createHeartbeatAgent({ game, adapterVersion, config, queryServer, fetchImpl = fetch, logger = console }) {
  let timer = null;
  let stopped = true;
  let running = false;

  async function reportOnce() {
    if (running) return { sent: false, reason: "already_running" };
    running = true;
    try {
      let state;
      try {
        state = await queryServer({ host: config.queryHost, port: config.queryPort });
      } catch (error) {
        // A query timeout is not proof that the dedicated server is offline.
        // Skip this heartbeat and let Core's stale-heartbeat window handle loss of contact.
        logger.warn?.(`[${game}] Game query failed; heartbeat skipped: ${error.message}`);
        return { sent: false, reason: "game_query_failed" };
      }

      const payload = {
        game,
        serverVersion: String(config.serverVersion || state.version || "unknown").slice(0, 100),
        adapterVersion,
        online: true,
        observedAt: new Date().toISOString()
      };
      if (Array.isArray(state.players)) payload.playerCount = state.players.length;

      const endpoint = new URL(
        `/integrations/servers/${encodeURIComponent(config.serverId)}/heartbeat`,
        config.coreApiUrl
      );
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.serviceToken}`,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`Core heartbeat rejected with HTTP ${response.status}.`);
      return { sent: true, serverId: config.serverId, online: true };
    } finally {
      running = false;
    }
  }

  function scheduleNext() {
    if (stopped) return;
    timer = setTimeout(async () => {
      try {
        await reportOnce();
      } catch (error) {
        logger.error?.(`[${game}] Core heartbeat failed: ${error.message}`);
      } finally {
        scheduleNext();
      }
    }, config.intervalMs);
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    void reportOnce()
      .catch((error) => logger.error?.(`[${game}] Initial Core heartbeat failed: ${error.message}`))
      .finally(scheduleNext);
  }

  function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { reportOnce, start, stop };
}

module.exports = { createHeartbeatAgent };
