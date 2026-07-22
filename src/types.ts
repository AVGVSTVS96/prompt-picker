export type SourceId = string;

export interface SourceInfo {
  id: SourceId;
  label: string;
  color?: string;
}

export interface Prompt {
  id: string;
  source: SourceId;
  sourceLabel: string;
  model?: string;
  modelLabel: string;
  text: string;
  ts: number;
  cwd?: string;
  project?: string;
  sessionId: string;
  file: string;
  /** Written by an agent or app, not typed by the user. Hidden unless explicitly requested. */
  agent?: true;
}

export interface FileEntry {
  file: string;
  mtimeMs: number;
  size: number;
  prompts: Prompt[];
}
