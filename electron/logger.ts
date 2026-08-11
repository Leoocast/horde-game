import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const MAX_LOG_BYTES = 1024 * 1024;

export class RotatingFileLogger {
  readonly filePath: string;
  #tail: Promise<void> = Promise.resolve();

  constructor(logDirectory: string) {
    this.filePath = path.join(logDirectory, "main.log");
  }

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await this.rotateIfNeeded();
  }

  log(level: "info" | "warn" | "error", message: string, details?: unknown): void {
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${sanitize(message)}${formatDetails(details)}\n`;
    this.#tail = this.#tail
      .then(async () => {
        await this.rotateIfNeeded(Buffer.byteLength(line));
        await appendFile(this.filePath, line, "utf8");
      })
      .catch(() => undefined);
  }

  async flush(): Promise<void> {
    await this.#tail;
  }

  private async rotateIfNeeded(pendingBytes = 0): Promise<void> {
    try {
      const info = await stat(this.filePath);
      if (info.size + pendingBytes < MAX_LOG_BYTES) return;
      await rm(`${this.filePath}.1`, { force: true });
      await rename(this.filePath, `${this.filePath}.1`);
    } catch {
      // A missing log is the expected first-run state.
    }
  }
}

function sanitize(value: string): string {
  return value.replace(/[\r\n\0]+/gu, " ").slice(0, 4096);
}

function formatDetails(details: unknown): string {
  if (details === undefined) return "";
  if (details instanceof Error) return ` | ${sanitize(details.stack ?? details.message)}`;
  try {
    return ` | ${sanitize(JSON.stringify(details))}`;
  } catch {
    return " | [unserializable details]";
  }
}
