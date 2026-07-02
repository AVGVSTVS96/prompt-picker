import { makePrompt } from "./api.ts";
import { isBlank, joinTextParts } from "./util.ts";
import type { Prompt } from "../types.ts";

const INJECTED_PREFIXES = [
  "<environment_context>",
  "<user_instructions>",
  "<user_shell_environment>",
  "<system-reminder>",
  "## My request for Codex:",
];

const TEXT_TYPES = ["input_text", "text"] as const;

function looksInjected(text: string): boolean {
  const t = text.trimStart();
  return INJECTED_PREFIXES.some((p) => t.startsWith(p));
}

function joinContent(content: unknown): string {
  return joinTextParts(content, TEXT_TYPES);
}

interface UserLine {
  line: number;
  text: string;
  ts: unknown;
  model?: string;
}

export function parseCodex(file: string, raw: string): Prompt[] {
  const lines = raw.split("\n");

  let cwd: string | undefined;
  let sessionId = file;
  let provider = "openai";
  let sawSessionMeta = false;
  let sessionFallbackModel: string | undefined;
  let nearestTurnContextModel: string | undefined;
  let hasEventUsers = false;
  const eventUsers: UserLine[] = [];
  const itemUsers: UserLine[] = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || isBlank(line)) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }

    if (e.type === "session_meta" && e.payload && !sawSessionMeta) {
      const p = e.payload;
      if (typeof p.cwd === "string") cwd = p.cwd;
      if (typeof p.id === "string") sessionId = p.id;
      if (typeof p.model_provider === "string") provider = p.model_provider;
      sawSessionMeta = true;
      continue;
    }

    if (e.type === "turn_context" && typeof e.payload?.model === "string") {
      nearestTurnContextModel = e.payload.model;
      sessionFallbackModel ??= e.payload.model;
      continue;
    }

    const p = e.payload;
    const isEventUser = e.type === "event_msg" && p?.type === "user_message";
    const isItemUser =
      e.type === "response_item" && p?.type === "message" && p.role === "user";

    if (isEventUser) {
      hasEventUsers = true;
      const text = typeof p.message === "string" ? p.message : joinContent(p.message);
      if (!isBlank(text) && !looksInjected(text)) {
        eventUsers.push({ line: i, text, ts: e.timestamp, model: nearestTurnContextModel });
      }
      continue;
    }

    if (isItemUser) {
      const text = joinContent(p.content);
      if (!isBlank(text) && !looksInjected(text)) {
        itemUsers.push({ line: i, text, ts: e.timestamp, model: nearestTurnContextModel });
      }
    }
  }

  const users = hasEventUsers ? eventUsers : itemUsers;
  const out: Prompt[] = [];
  for (const u of users) {
    const model = u.model ?? sessionFallbackModel;
    out.push(
      makePrompt({
        source: "codex",
        sourceLabel: "Codex",
        file,
        line: u.line,
        text: u.text,
        ts: u.ts,
        cwd,
        sessionId,
        model,
        provider,
        modelLabel: model ? undefined : "Codex",
      }),
    );
  }
  return out;
}
