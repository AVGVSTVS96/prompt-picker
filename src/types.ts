export type SourceId = string;

/** @deprecated Use Prompt.source instead. */
export type Agent = SourceId;

export type ModelKey = "opus-4-7" | "opus-4-8" | "gpt-5-5" | "other";

export interface SourceInfo {
  id: SourceId;
  label: string;
  color?: string;
  modelFilters?: boolean;
}

export interface Prompt {
  id: string;
  source: SourceId;
  sourceLabel: string;
  /** @deprecated Use source/sourceLabel instead. */
  agent?: Agent;
  model?: string;
  modelKey: ModelKey;
  modelLabel: string;
  text: string;
  ts: number;
  cwd?: string;
  project?: string;
  sessionId: string;
  file: string;
}

export interface FileEntry {
  file: string;
  mtimeMs: number;
  size: number;
  prompts: Prompt[];
}
