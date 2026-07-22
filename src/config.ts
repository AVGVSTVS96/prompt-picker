import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { configDir } from "./paths.ts";
import { builtinSources } from "./sources/builtins.ts";
import { labelModel } from "./sources/model.ts";
import {
  defineFileSource,
  defineSource,
  makePrompt,
  type FilePromptSource,
  type LoadPromptSource,
  type PromptSource,
} from "./sources/api.ts";
import type { Prompt } from "./types.ts";

export type { Prompt, SourceInfo } from "./types.ts";
export type {
  FileParseInput,
  FilePromptSource,
  FilePromptSourceInput,
  LoadPromptSource,
  LoadPromptSourceInput,
  PromptInput,
  PromptSource,
  SourceLoadInput,
} from "./sources/api.ts";
export { builtinSources, labelModel, configDir, defineFileSource, defineSource, makePrompt };

export type Filter = (prompt: Prompt) => boolean;

export interface PromptPickerConfig {
  filters: Filter[];
  sources: PromptSource[];
  includeBuiltins: boolean;
}

export interface ConfigApi {
  defineFileSource: typeof defineFileSource;
  defineSource: typeof defineSource;
  makePrompt: typeof makePrompt;
  labelModel: typeof labelModel;
  builtinSources: typeof builtinSources;
}

export type ConfigInput =
  | Filter[]
  | {
      filters?: Filter[];
      sources?: PromptSource[];
      includeBuiltins?: boolean;
    };

export type ConfigFactory = (api: ConfigApi) => ConfigInput | Promise<ConfigInput>;

const CONFIG_FILE_NAMES = ["config.ts", "config.js"];

const configApi: ConfigApi = {
  defineFileSource,
  defineSource,
  makePrompt,
  labelModel,
  builtinSources,
};

function asFilterList(raw: unknown): Filter[] {
  return Array.isArray(raw) ? raw.filter((f): f is Filter => typeof f === "function") : [];
}

function asSourceList(raw: unknown): PromptSource[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is PromptSource => {
    if (!s || typeof s !== "object") return false;
    const source = s as { id?: unknown; label?: unknown; type?: unknown };
    return (
      typeof source.id === "string" &&
      typeof source.label === "string" &&
      (source.type === "file" || source.type === "load")
    );
  });
}

function normalizeConfig(raw: unknown, named: Record<string, unknown> = {}): PromptPickerConfig {
  const base = Array.isArray(raw) ? { filters: raw } : raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const filters = asFilterList(named.filters ?? base.filters ?? raw);
  const sources = asSourceList(named.sources ?? base.sources);
  const includeBuiltins = named.includeBuiltins ?? base.includeBuiltins;

  return {
    filters,
    sources,
    includeBuiltins: typeof includeBuiltins === "boolean" ? includeBuiltins : true,
  };
}

export async function loadConfig(): Promise<PromptPickerConfig> {
  for (const name of CONFIG_FILE_NAMES) {
    const path = join(configDir(), name);
    if (!(await Bun.file(path).exists())) continue;
    try {
      const mod = await import(pathToFileURL(path).href);
      const rawDefault =
        typeof mod.default === "function" ? await (mod.default as ConfigFactory)(configApi) : mod.default;
      const raw = rawDefault ?? mod;
      return normalizeConfig(raw, mod);
    } catch (err) {
      console.error(`prompt-picker: ignoring ${path}\n  ${err}`);
      return normalizeConfig(undefined);
    }
  }
  return normalizeConfig(undefined);
}

export async function loadConfigFilters(): Promise<Filter[]> {
  return (await loadConfig()).filters;
}

export function configuredSources(config: PromptPickerConfig): PromptSource[] {
  return config.includeBuiltins ? [...builtinSources(), ...config.sources] : config.sources;
}

export function applyConfigFilters(prompts: Prompt[], filters: Filter[]): Prompt[] {
  if (filters.length === 0) return prompts;
  return prompts.filter((p) => filters.every((f) => f(p)));
}
