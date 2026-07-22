import type { Prompt, SourceInfo } from "./types.ts";

export type SourceTab = "all" | "favorites" | string;

export interface SourceTabInfo {
  id: SourceTab;
  label: string;
  color?: string;
}

export const INLINE_MODEL_TABS = 3;

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

// Distinct model labels, most recently used first: when the user switches to
// a new daily-driver model it should rank first immediately, not once it
// outnumbers older models.
export function modelTabs(prompts: Prompt[]): string[] {
  const latest = new Map<string, number>();
  for (const p of prompts) {
    if (p.ts > (latest.get(p.modelLabel) ?? -Infinity)) latest.set(p.modelLabel, p.ts);
  }
  return [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
}

function normalizeSeparators(s: string): string {
  return s.toLowerCase().replace(/[-.\s]+/g, "");
}

function firstNumber(s: string): number {
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : -Infinity;
}

// Substring match against modelLabel (- . and space treated as equivalent).
// A query with no digits keeps only the matches at the highest version
// number, e.g. "gpt" over GPT-5.6 Sol/Terra and GPT-5.5 keeps only the 5.6s.
export function matchModels(labels: string[], query: string): string[] {
  const normalizedQuery = normalizeSeparators(query);
  const matched = labels.filter((label) => normalizeSeparators(label).includes(normalizedQuery));
  if (/\d/.test(query)) return matched;

  const best = Math.max(...matched.map(firstNumber));
  return matched.filter((label) => firstNumber(label) === best);
}

export function filterPrompts(
  prompts: Prompt[],
  source: SourceTab,
  model: string | null,
  isFavorite: (id: string) => boolean,
): Prompt[] {
  const out: Prompt[] = [];
  for (const p of prompts) {
    if (source === "favorites") {
      if (!isFavorite(p.id)) continue;
    } else if (source !== "all") {
      if (p.source !== source) continue;
    }
    if (model && p.modelLabel !== model) continue;
    out.push(p);
  }
  return out;
}
