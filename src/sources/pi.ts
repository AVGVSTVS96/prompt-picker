import { classifyModel } from "./model.ts";
import { isBlank, joinTextParts, projectName, promptId, toMs } from "./util.ts";
import type { Prompt } from "../types.ts";

const INJECTED_PREFIXES = [
  "<skill name=",
  "<files>",
  "<file ",
  "<system-reminder>",
  "<command-",
  "The conversation history before this point was compacted",
  "The following is a summary of a branch",
  "The following files were included as context",
  "Ran `",
];

const INJECTED_INCLUDES = ["References are relative to "];

const TEXT_TYPES = ["text"] as const;

function looksInjected(text: string): boolean {
  const t = text.trimStart();
  if (INJECTED_PREFIXES.some((p) => t.startsWith(p))) return true;
  const head = t.slice(0, 600);
  return INJECTED_INCLUDES.some((s) => head.includes(s));
}

function joinContent(content: unknown): string {
  return joinTextParts(content, TEXT_TYPES);
}

interface UserLine {
  line: number;
  text: string;
  ts: unknown;
  provider?: string;
  modelId?: string;
}

export function parsePi(file: string, raw: string): Prompt[] {
  const lines = raw.split("\n");

  let cwd: string | undefined;
  let sessionId = file;

  for (const line of lines) {
    if (!line || isBlank(line)) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "session") {
      if (typeof e.cwd === "string") cwd = e.cwd;
      if (typeof e.id === "string") sessionId = e.id;
      break;
    }
  }

  const users: UserLine[] = [];
  let nearestReplyProvider: string | undefined;
  let nearestReplyModel: string | undefined;
  let latestModelChange: { provider?: string; modelId?: string } | undefined;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || isBlank(line)) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }

    if (e.type === "model_change") {
      if (!latestModelChange) latestModelChange = { provider: e.provider, modelId: e.modelId };
      continue;
    }

    if (e.type !== "message") continue;
    const role = e.message?.role;

    if (role === "assistant" && typeof e.message?.model === "string") {
      nearestReplyProvider = e.message.provider;
      nearestReplyModel = e.message.model;
      continue;
    }

    if (role === "user") {
      const text = joinContent(e.message.content);
      if (isBlank(text) || looksInjected(text)) continue;
      users.push({
        line: i,
        text,
        ts: e.timestamp,
        provider: nearestReplyProvider,
        modelId: nearestReplyModel,
      });
    }
  }

  const out: Prompt[] = [];
  for (const u of users) {
    const provider = u.modelId ? u.provider : latestModelChange?.provider;
    const modelId = u.modelId ?? latestModelChange?.modelId;
    const { modelKey, modelLabel } = classifyModel(modelId, provider);
    out.push({
      id: promptId("pi", file, u.line, u.text),
      agent: "pi",
      model: modelId,
      modelKey,
      modelLabel,
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
