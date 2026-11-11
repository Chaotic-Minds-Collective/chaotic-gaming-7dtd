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

  const dispatch = () => {
    if (event.data.length === 0) return null;
    const result = {
      event: event.event || "message",
      data: event.data.join("\n"),
      ...(event.id !== undefined ? { id: event.id } : {}),
      ...(event.retry !== undefined ? { retry: event.retry } : {})
    };
    event = { data: [] };
    return result;
  };

  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new Error("SSE stream aborted");
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      let boundary;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        if (line === "") {
          const parsed = dispatch();
          if (parsed) yield parsed;
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let valueText = colon === -1 ? "" : line.slice(colon + 1);
        if (valueText.startsWith(" ")) valueText = valueText.slice(1);

        if (field === "data") event.data.push(valueText);
        else if (field === "event") event.event = valueText;
        else if (field === "id" && !valueText.includes("\0")) event.id = valueText;
        else if (field === "retry" && /^\d+$/.test(valueText)) event.retry = Number(valueText);
      }

      if (done) {
        const parsed = dispatch();
        if (parsed) yield parsed;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
