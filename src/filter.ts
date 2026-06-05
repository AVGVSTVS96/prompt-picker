import type { ModelKey, Prompt } from "./types.ts";

export type AgentTab = "all" | "claude" | "codex" | "pi" | "favorites";
export type ModelTab = "all" | "opus-4-8" | "opus-4-7" | "gpt-5-5";

export const AGENT_TABS: AgentTab[] = ["all", "claude", "codex", "pi", "favorites"];
export const MODEL_TABS: ModelTab[] = ["all", "opus-4-8", "opus-4-7", "gpt-5-5"];

export const AGENT_LABEL: Record<AgentTab, string> = {
  all: "All",
  claude: "Claude",
  codex: "Codex",
  pi: "Pi",
  favorites: "★ Favorites",
};

export const MODEL_LABEL: Record<ModelTab, string> = {
  all: "All models",
  "opus-4-8": "Opus 4.8",
  "opus-4-7": "Opus 4.7",
  "gpt-5-5": "GPT-5.5",
};

export function modelFilterActive(agent: AgentTab): boolean {
  return agent === "pi";
}

export function filterPrompts(
  prompts: Prompt[],
  agent: AgentTab,
  model: ModelTab,
  isFavorite: (id: string) => boolean,
): Prompt[] {
  const requiredModel: ModelKey | null =
    modelFilterActive(agent) && model !== "all" ? model : null;

  const out: Prompt[] = [];
  for (const p of prompts) {
    if (agent === "favorites") {
      if (!isFavorite(p.id)) continue;
    } else if (agent !== "all") {
      if (p.agent !== agent) continue;
    }
    if (requiredModel && p.modelKey !== requiredModel) continue;
    out.push(p);
  }
  return out;
}
