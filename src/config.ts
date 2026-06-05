import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Prompt } from "./types.ts";

export type { Prompt } from "./types.ts";

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "prompt-picker");
}

export type Filter = (prompt: Prompt) => boolean;

const CONFIG_FILE_NAMES = ["config.ts", "config.js"];

export async function loadConfigFilters(): Promise<Filter[]> {
  for (const name of CONFIG_FILE_NAMES) {
    const path = join(configDir(), name);
    if (!(await Bun.file(path).exists())) continue;
    try {
      const mod = await import(pathToFileURL(path).href);
      const raw = mod.filters ?? mod.default;
      const list = Array.isArray(raw) ? raw : (raw?.filters ?? []);
      return list.filter((f: unknown): f is Filter => typeof f === "function");
    } catch (err) {
      console.error(`prompt-picker: ignoring ${path}\n  ${err}`);
      return [];
    }
  }
  return [];
}

export function applyConfigFilters(prompts: Prompt[], filters: Filter[]): Prompt[] {
  if (filters.length === 0) return prompts;
  return prompts.filter((p) => filters.every((f) => f(p)));
}
