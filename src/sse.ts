export interface SseMessage {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;

  const dispatch = (): SseMessage | undefined => {
    if (data.length === 0) {
      event = "message";
      id = undefined;
      retry = undefined;
      return undefined;
    }
    const message: SseMessage = {
      event,
      data: data.join("\n"),
      ...(id === undefined ? {} : { id }),
      ...(retry === undefined ? {} : { retry }),
    };
    event = "message";
    data = [];
    id = undefined;
    retry = undefined;
    return message;
  };

  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        if (line === "") {
          const message = dispatch();
          if (message) yield message;
          continue;
        }
        if (line.startsWith(":")) continue;

        const separator = line.indexOf(":");
        const field = separator === -1 ? line : line.slice(0, separator);
        const valueText = separator === -1
          ? ""
          : line.slice(separator + 1).replace(/^ /, "");

        if (field === "event") event = valueText;
        else if (field === "data") data.push(valueText);
        else if (field === "id" && !valueText.includes("\0")) id = valueText;
        else if (field === "retry" && /^\d+$/.test(valueText)) retry = Number(valueText);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
