import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class EventCursor {
  constructor(filePath) {
    if (!filePath) throw new TypeError("An event cursor path is required.");
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
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, eventId, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
