import { Glob } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { builtinSources } from "./builtins.ts";
import { applySourceDefaults, sourceInfo, type PromptSource } from "./api.ts";
import { configDir } from "../paths.ts";
import type { FileEntry, Prompt, SourceInfo } from "../types.ts";

const HOME = homedir();
const CACHE_DIR = configDir();
const CACHE_FILE = join(CACHE_DIR, "index-cache.json");
const CACHE_VERSION = 9;

interface Cache {
  version: number;
  entries: Record<string, FileEntry>;
}

async function loadCache(): Promise<Cache> {
  try {
    const c = (await Bun.file(CACHE_FILE).json()) as Cache;
    if (c?.version === CACHE_VERSION && c.entries) return c;
  } catch {}
  return { version: CACHE_VERSION, entries: {} };
}

async function saveCache(entries: Record<string, FileEntry>): Promise<void> {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    await Bun.write(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, entries }));
  } catch {}
}

function expandHome(path: string): string {
  if (path === "~") return HOME;
  if (path.startsWith("~/")) return join(HOME, path.slice(2));
  return path;
}

export interface IndexResult {
  prompts: Prompt[];
  sources: SourceInfo[];
  scanned: number;
  parsed: number;
  reused: number;
}

export interface BuildIndexOptions {
  sources?: PromptSource[];
}

export async function buildIndex(options: BuildIndexOptions = {}): Promise<IndexResult> {
  const sources = options.sources ?? builtinSources();
  const sourceMetas = sources.map(sourceInfo);
  const prev = await loadCache();
  const next: Record<string, FileEntry> = {};
  const loadedPrompts: Prompt[] = [];
  let parsed = 0;
  let reused = 0;
  let scanned = 0;

  const jobs: Promise<void>[] = [];

  for (const src of sources) {
    if (src.type === "load") {
      jobs.push(
        (async () => {
          try {
            const prompts = await src.load({ source: src });
            loadedPrompts.push(...prompts.map((p) => applySourceDefaults(p, src)));
            parsed++;
            scanned++;
          } catch (err) {
            console.error(`prompt-picker: ignoring source ${src.id}\n  ${err}`);
          }
        })(),
      );
      continue;
    }

    const glob = new Glob(src.glob);
    let files: string[];
    try {
      files = await Array.fromAsync(glob.scan({ cwd: expandHome(src.root), absolute: true }));
    } catch {
      continue;
    }

    for (const file of files) {
      const cacheKey = `${src.id}:${file}`;
      jobs.push(
        (async () => {
          let stat;
          try {
            stat = await Bun.file(file).stat();
          } catch {
            return;
          }
          const mtimeMs = stat.mtimeMs;
          const size = stat.size;

          const cached = prev.entries[cacheKey];
          if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
            next[cacheKey] = cached;
            reused++;
            scanned++;
            return;
          }

          let raw: string;
          try {
            raw = await Bun.file(file).text();
          } catch {
            return;
          }
          const parsedPrompts = await src.parse({ file, raw, source: src });
          const prompts = parsedPrompts.map((p) => applySourceDefaults(p, src));
          next[cacheKey] = { file, mtimeMs, size, prompts };
          parsed++;
          scanned++;
        })(),
      );
    }
  }

  await Promise.all(jobs);
  await saveCache(next);

  const prompts: Prompt[] = [...loadedPrompts];
  for (const entry of Object.values(next)) prompts.push(...entry.prompts);
  prompts.sort((a, b) => b.ts - a.ts);

  return { prompts, sources: sourceMetas, scanned, parsed, reused };
}
