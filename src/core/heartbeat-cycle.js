export async function runHeartbeatCycle({ probe, publish, logger = console }) {
  let observation;
  try {
    observation = await probe();
  } catch (error) {
    // A failed Telnet probe is not proof that the game process is offline.
    // Skip this write and let Core's stale-heartbeat window handle loss of contact.
    logger.warn?.(error);
    return { sent: false, reason: "probe_failed" };
  }

  try {
    await publish(observation);
    return { sent: true, observation };
  } catch (error) {
    logger.error?.(error);
    return { sent: false, reason: "publish_failed" };
  }
}
