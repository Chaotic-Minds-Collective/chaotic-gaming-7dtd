import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class EventCursor {
  constructor(filePath) {
    if (!filePath) throw new TypeError("An event cursor path is required.");
    // filePath is expected to come from configuration (environment variable or default),
    // not from user input. See run-event-bridge.js for typical usage.
    this.filePath = filePath;
  }

  async load() {
    try {
      return (await readFile(this.filePath, "utf8")).trim() || undefined;
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(eventId) {
    if (!eventId || typeof eventId !== "string") return;
    // eventId is untrusted input but is only written as file content, not used in path construction.
    // The file paths (this.filePath and temporaryPath) derive from the constructor parameter,
    // which should be a trusted configuration value.
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, eventId, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
