import type { ModelKey, Prompt, SourceInfo } from "./types.ts";

export type SourceTab = "all" | "favorites" | string;
export type AgentTab = SourceTab;
export type ModelTab = "all" | "opus-4-8" | "opus-4-7" | "gpt-5-5";

export interface SourceTabInfo {
  id: SourceTab;
  label: string;
  color?: string;
  modelFilters?: boolean;
}

export const MODEL_TABS: ModelTab[] = ["all", "opus-4-8", "opus-4-7", "gpt-5-5"];

export const MODEL_LABEL: Record<ModelTab, string> = {
  all: "All models",
  "opus-4-8": "Opus 4.8",
  "opus-4-7": "Opus 4.7",
  "gpt-5-5": "GPT-5.5",
};

export function sourceTabs(sources: SourceInfo[]): SourceTabInfo[] {
  const seen = new Set<string>();
  const tabs: SourceTabInfo[] = [{ id: "all", label: "All" }];
  for (const source of sources) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    tabs.push(source);
  }
  tabs.push({ id: "favorites", label: "★ Favorites" });
  return tabs;
}

export function modelFilterActive(source: SourceTab, sources: SourceInfo[] = []): boolean {
  if (source === "all" || source === "favorites") return false;
  return sources.find((s) => s.id === source)?.modelFilters === true;
}

export function filterPrompts(
  prompts: Prompt[],
  source: SourceTab,
  model: ModelTab,
  isFavorite: (id: string) => boolean,
  sources: SourceInfo[] = [],
): Prompt[] {
  const requiredModel: ModelKey | null =
    modelFilterActive(source, sources) && model !== "all" ? model : null;

  const out: Prompt[] = [];
  for (const p of prompts) {
    if (source === "favorites") {
      if (!isFavorite(p.id)) continue;
    } else if (source !== "all") {
      if (p.source !== source) continue;
    }
    if (requiredModel && p.modelKey !== requiredModel) continue;
    out.push(p);
  }
  return out;
}
