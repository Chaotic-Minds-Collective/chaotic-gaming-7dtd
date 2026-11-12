import { appendFile, chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { CoreEventValidationError } from "./core-publisher.js";
import { dirname } from "node:path";

export class DurableEventSpool {
  constructor(filePath, { maxEvents = 10_000, maxBytes = 50 * 1024 * 1024, maxQuarantineBytes = 50 * 1024 * 1024 } = {}) {
    if (!filePath) throw new TypeError("A local event spool path is required.");
    if (!Number.isSafeInteger(maxQuarantineBytes) || maxQuarantineBytes < 1) {
      throw new TypeError("maxQuarantineBytes must be a positive safe integer.");
    }
    this.maxQuarantineBytes = maxQuarantineBytes;
    this.filePath = filePath;
    this.quarantinePath = `${filePath}.quarantine.jsonl`;
    this.maxEvents = maxEvents;
    this.maxBytes = maxBytes;
    this.operation = Promise.resolve();
  }

  runExclusive(callback) {
    const next = this.operation.then(callback, callback);
    this.operation = next.catch(() => {});
    return next;
  }

  async readLines() {
    try {
      const content = await readFile(this.filePath, "utf8");
      return content.split("\n").filter(Boolean);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async enqueue(event) {
    return this.runExclusive(async () => {
      const line = JSON.stringify(event);
      const current = await this.readLines();
      if (current.length >= this.maxEvents) {
        throw new Error("Core event spool reached its event limit; refusing to drop events.");
      }
      let currentBytes = 0;
      try {
        currentBytes = (await stat(this.filePath)).size;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      if (currentBytes + Buffer.byteLength(line, "utf8") + 1 > this.maxBytes) {
        throw new Error("Core event spool reached its size limit; refusing to drop events.");
      }
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${line}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(this.filePath, 0o600);
    });
  }

  async flush(publish) {
    return this.runExclusive(async () => {
      const lines = await this.readLines();
      if (lines.length === 0) return { delivered: 0, pending: 0 };

      const pending = [];
      let delivered = 0;
      for (let index = 0; index < lines.length; index += 1) {
        let event;
        try {
          event = JSON.parse(lines[index]);
        } catch {
          pending.push(...lines.slice(index));
          break;
        }
        try {
          await publish(event);
          delivered += 1;
        } catch (error) {
          if (!(error instanceof CoreEventValidationError)) {
            pending.push(...lines.slice(index));
            break;
          }
          let quarantineBytes = 0;
          try {
            quarantineBytes = (await stat(this.quarantinePath)).size;
          } catch (quarantineError) {
            if (quarantineError?.code !== "ENOENT") throw quarantineError;
          }
          const quarantineLine = `${lines[index]}\n`;
          if (quarantineBytes + Buffer.byteLength(quarantineLine, "utf8") > this.maxQuarantineBytes) {
            throw new Error("Core event quarantine reached its size limit; pending events retained. Archive or remove quarantine entries before retrying.");
          }
          // Persist before removing from pending. A failed write leaves the queue intact.
          await appendFile(this.quarantinePath, quarantineLine, { encoding: "utf8", mode: 0o600 });
          await chmod(this.quarantinePath, 0o600);
          console.warn("[7DTD Bridge] Quarantined Core event:", event?.eventId ?? "(missing event ID)");
        }
      }

      const temporaryPath = `${this.filePath}.tmp`;
      if (pending.length === 0) {
        await writeFile(temporaryPath, "", { encoding: "utf8", mode: 0o600 });
      } else {
        await writeFile(temporaryPath, `${pending.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
      }
      await rename(temporaryPath, this.filePath);
      await chmod(this.filePath, 0o600);
      return { delivered, pending: pending.length };
    });
  }
}
