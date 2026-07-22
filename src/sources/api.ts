import { labelModel } from "./model.ts";
import { projectName, promptId, toMs } from "./util.ts";
import type { Prompt, SourceInfo } from "../types.ts";

export interface FileParseInput {
  file: string;
  raw: string;
  source: FilePromptSource;
}

export interface SourceLoadInput {
  source: LoadPromptSource;
}

export interface FilePromptSource extends SourceInfo {
  type: "file";
  root: string;
  glob: string | string[];
  parse(input: FileParseInput): Prompt[] | Promise<Prompt[]>;
}

export interface LoadPromptSource extends SourceInfo {
  type: "load";
  load(input: SourceLoadInput): Prompt[] | Promise<Prompt[]>;
}

export type PromptSource = FilePromptSource | LoadPromptSource;

export type FilePromptSourceInput = Omit<FilePromptSource, "type"> & { type?: "file" };
export type LoadPromptSourceInput = Omit<LoadPromptSource, "type"> & { type?: "load" };

export interface PromptInput {
  id?: string;
  source: string;
  sourceLabel?: string;
  file: string;
  line?: number;
  text: string;
  ts?: unknown;
  cwd?: string;
  project?: string;
  sessionId?: string;
  model?: string;
  provider?: string;
  modelLabel?: string;
  agent?: boolean;
  unsent?: boolean;
}

export function defineFileSource(input: FilePromptSourceInput): FilePromptSource {
  return { ...input, type: "file" };
}

export function defineSource(input: LoadPromptSourceInput): LoadPromptSource {
  return { ...input, type: "load" };
}

export function makePrompt(input: PromptInput): Prompt {
  const modelLabel = input.modelLabel ?? labelModel(input.model, input.provider);
  const sourceLabel = input.sourceLabel ?? input.source;
  const text = input.text.trim();

  return {
    id: input.id ?? promptId(input.source, input.file, input.line ?? 0, text),
    source: input.source,
    sourceLabel,
    model: input.model,
    modelLabel,
    text,
    ts: toMs(input.ts),
    cwd: input.cwd,
    project: input.project ?? projectName(input.cwd),
    sessionId: input.sessionId ?? input.file,
    file: input.file,
    agent: input.agent ? true : undefined,
    unsent: input.unsent ? true : undefined,
  };
}

export function sourceInfo(source: PromptSource): SourceInfo {
  const { id, label, color } = source;
  return { id, label, color };
}

export function applySourceDefaults(prompt: Prompt, source: SourceInfo): Prompt {
  const sourceId = prompt.source || source.id;
  return {
    ...prompt,
    source: sourceId,
    sourceLabel: prompt.sourceLabel || source.label,
  };
}
