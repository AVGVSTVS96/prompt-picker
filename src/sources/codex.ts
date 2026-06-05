import { classifyModel } from "./model.ts";
import { isBlank, projectName, promptId, toMs } from "./util.ts";
import type { Prompt } from "../types.ts";

const INJECTED_PREFIXES = [
  "<environment_context>",
  "<user_instructions>",
  "<user_shell_environment>",
  "<system-reminder>",
  "## My request for Codex:",
];

function looksInjected(text: string): boolean {
  const t = text.trimStart();
  return INJECTED_PREFIXES.some((p) => t.startsWith(p));
}

function joinContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const type = (part as any).type;
    if ((type === "input_text" || type === "text") && typeof (part as any).text === "string") {
      parts.push((part as any).text);
    }
  }
  return parts.join("\n");
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
  let sessionFallbackModel: string | undefined;

  let hasEventUsers = false;
  for (const line of lines) {
    if (!line || isBlank(line)) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "session_meta" && e.payload) {
      const p = e.payload;
      if (typeof p.cwd === "string") cwd = p.cwd;
      if (typeof p.id === "string") sessionId = p.id;
      if (typeof p.model_provider === "string") provider = p.model_provider;
    } else if (e.type === "event_msg" && e.payload?.type === "user_message") {
      hasEventUsers = true;
    }
  }

  const users: UserLine[] = [];
  let nearestTurnContextModel: string | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || isBlank(line)) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
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

    if ((hasEventUsers && isEventUser) || (!hasEventUsers && isItemUser)) {
      const text = isEventUser
        ? typeof p.message === "string"
          ? p.message
          : joinContent(p.message)
        : joinContent(p.content);
      if (isBlank(text) || looksInjected(text)) continue;
      users.push({ line: i, text, ts: e.timestamp, model: nearestTurnContextModel });
    }
  }

  const out: Prompt[] = [];
  for (const u of users) {
    const model = u.model ?? sessionFallbackModel;
    const { modelKey, modelLabel } = classifyModel(model, provider);
    out.push({
      id: promptId("codex", file, u.line, u.text),
      agent: "codex",
      model,
      modelKey,
      modelLabel: model ? modelLabel : "Codex",
      text: u.text.trim(),
      ts: toMs(u.ts),
      cwd,
      project: projectName(cwd),
      sessionId,
      file,
    });
  }
  return out;
}
