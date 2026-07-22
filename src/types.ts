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
}

export interface FileEntry {
  file: string;
  mtimeMs: number;
  size: number;
  prompts: Prompt[];
}
