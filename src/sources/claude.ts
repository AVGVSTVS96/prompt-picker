import { classifyModel } from "./model.ts";
import { isBlank, projectName, promptId, toMs } from "./util.ts";
import type { Prompt } from "../types.ts";

const INJECTED_PREFIXES = [
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<local-command-stdout>",
  "<local-command-stderr>",
  "<local-command-caveat>",
  "<bash-stdout>",
  "<bash-stderr>",
  "<bash-input>",
  "<task-notification>",
  "<system-reminder>",
  "<user-memory-input>",
  "Caveat: The messages below",
];

function looksInjected(text: string): boolean {
  const t = text.trimStart();
  return INJECTED_PREFIXES.some((p) => t.startsWith(p));
}

function extractUserText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const type = (part as any).type;
    if (type === "tool_result") return null;
    if (type === "text" && typeof (part as any).text === "string") {
      parts.push((part as any).text);
    }
  }
  return parts.length ? parts.join("\n") : null;
}

interface UserLine {
  line: number;
  text: string;
  ts: unknown;
  cwd?: string;
  sessionId: string;
}

export function parseClaude(file: string, raw: string): Prompt[] {
  const lines = raw.split("\n");
  const users: UserLine[] = [];
  const modelAt = new Array<string | undefined>(lines.length);

  let sessionFallbackModel: string | undefined;
  let nearestReplyModel: string | undefined;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || isBlank(line)) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }

    if (e.type === "assistant") {
      const m = e.message?.model;
      if (typeof m === "string" && m && m !== "<synthetic>") {
        nearestReplyModel = m;
        sessionFallbackModel ??= m;
      }
      continue;
    }

    if (e.type === "user" && e.isMeta !== true) {
      const text = extractUserText(e.message?.content);
      if (text == null || isBlank(text) || looksInjected(text)) continue;
      modelAt[i] = nearestReplyModel;
      users.push({
        line: i,
        text,
        ts: e.timestamp,
        cwd: typeof e.cwd === "string" ? e.cwd : undefined,
        sessionId: typeof e.sessionId === "string" ? e.sessionId : file,
      });
    }
  }

  const out: Prompt[] = [];
  for (const u of users) {
    const model = modelAt[u.line] ?? sessionFallbackModel;
    const { modelKey, modelLabel } = classifyModel(model, "anthropic");
    out.push({
      id: promptId("claude", file, u.line, u.text),
      agent: "claude",
      model,
      modelKey,
      modelLabel: model ? modelLabel : "Claude",
      text: u.text.trim(),
      ts: toMs(u.ts),
      cwd: u.cwd,
      project: projectName(u.cwd),
      sessionId: u.sessionId,
      file,
    });
  }
  return out;
}
