import { makePrompt } from "./api.ts";
import { isBlank } from "./util.ts";
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
    const { type, text } = part as { type?: unknown; text?: unknown };
    if (type === "tool_result") return null;
    if (type === "text" && typeof text === "string") {
      parts.push(text);
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
  agent?: boolean;
}

export function parseClaude(file: string, raw: string): Prompt[] {
  // Subagent transcripts live in their own subagents/ directory; every prompt
  // in them was written by the parent agent.
  const agentFile = file.includes("/subagents/");
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

    // In a main session, sidechain records are interleaved subagent noise.
    if (!agentFile && e.isSidechain === true) continue;

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
        // sdk-cli sessions are app-driven (Claude Agent SDK), not typed by the user.
        agent: agentFile || e.entrypoint === "sdk-cli",
      });
    }
  }

  const out: Prompt[] = [];
  for (const u of users) {
    const model = modelAt[u.line] ?? sessionFallbackModel;
    out.push(
      makePrompt({
        source: "claude",
        sourceLabel: "Claude",
        file,
        line: u.line,
        text: u.text,
        ts: u.ts,
        cwd: u.cwd,
        sessionId: u.sessionId,
        model,
        provider: "anthropic",
        modelLabel: model ? undefined : "Claude",
        agent: u.agent,
      }),
    );
  }
  return out;
}
