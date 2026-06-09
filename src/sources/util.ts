import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename } from "node:path";

export function promptId(agent: string, file: string, line: number, text: string): string {
  return createHash("sha1")
    .update(`${agent} ${file} ${line} ${text}`)
    .digest("hex")
    .slice(0, 16);
}

export function projectName(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const home = homedir();
  const base = basename(cwd);
  if (cwd === home) return "~";
  return base || cwd;
}

const MILLIS_THRESHOLD = 1e12;

export function toMs(ts: unknown): number {
  if (typeof ts === "number") return ts < MILLIS_THRESHOLD ? ts * 1000 : ts;
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

export function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

/**
 * Flatten a message `content` field to plain text, keeping only the part
 * `type`s in `textTypes`. Accepts a bare string, or an array of
 * `{ type, text }` parts; anything else yields "".
 */
export function joinTextParts(content: unknown, textTypes: readonly string[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const { type, text } = part as { type?: unknown; text?: unknown };
    if (typeof type === "string" && textTypes.includes(type) && typeof text === "string") {
      parts.push(text);
    }
  }
  return parts.join("\n");
}
