/**
 * Parse a WHATWG ReadableStream containing Server-Sent Events.
 * Handles chunk boundaries, comments, multiline data, IDs and retry values.
 */
export async function* parseServerSentEvents(stream, { signal } = {}) {
  if (!stream || typeof stream.getReader !== "function") {
    throw new TypeError("stream must be a ReadableStream");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = { data: [] };
  let lastEventId;
  let reachedEof = false;
  let cancellation;
  const cancelReader = () => {
    cancellation ??= reader.cancel(signal?.reason).catch(() => {});
    return cancellation;
  };
  const throwIfAborted = () => {
    if (signal?.aborted) throw signal.reason ?? new Error("SSE stream aborted");
  };

  const dispatch = () => {
    if (event.data.length === 0) {
      event = { data: [] };
      return null;
    }
    const result = {
      event: event.event || "message",
      data: event.data.join("\n"),
      ...(lastEventId !== undefined ? { id: lastEventId } : {}),
      ...(event.retry !== undefined ? { retry: event.retry } : {})
    };
    event = { data: [] };
    return result;
  };

  signal?.addEventListener("abort", cancelReader, { once: true });
  try {
    while (true) {
      throwIfAborted();
      const { value, done } = await reader.read();
      throwIfAborted();
      reachedEof = done;
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const trailingCr = !done && buffer.endsWith("\r");
      if (trailingCr) buffer = buffer.slice(0, -1);
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (trailingCr) buffer += "\r";

      let boundary;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        throwIfAborted();
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        if (line === "") {
          const parsed = dispatch();
          if (parsed) {
            throwIfAborted();
            yield parsed;
          }
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let valueText = colon === -1 ? "" : line.slice(colon + 1);
        if (valueText.startsWith(" ")) valueText = valueText.slice(1);

        if (field === "data") event.data.push(valueText);
        else if (field === "event") event.event = valueText;
        else if (field === "id" && !valueText.includes("\0")) lastEventId = valueText;
        else if (field === "retry" && /^\d+$/.test(valueText)) event.retry = Number(valueText);
      }

      if (done) return;
    }
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    try {
      if (!reachedEof) await cancelReader();
    } finally {
      reader.releaseLock();
    }
  }
}
