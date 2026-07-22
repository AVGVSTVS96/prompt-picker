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
// The cache stores parser OUTPUT, so stale entries survive until their file
// changes: bump this whenever a parser's behavior or the Prompt shape changes.
const CACHE_VERSION = 13;

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
  /** Include agent-written prompts (subagent transcripts, SDK-driven sessions). */
  agents?: boolean;
}

// Cap concurrent stat/read/parse jobs so a cold index over a large corpus
// doesn't hold every file's contents in memory at once.
const MAX_CONCURRENT_FILES = 32;

function limiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    while (active >= limit) await new Promise<void>((resume) => queue.push(resume));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
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
  let cacheDirty = false;

  const jobs: Promise<void>[] = [];
  const limit = limiter(MAX_CONCURRENT_FILES);

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

    const files: string[] = [];
    try {
      for (const pattern of Array.isArray(src.glob) ? src.glob : [src.glob]) {
        const glob = new Glob(pattern);
        files.push(...(await Array.fromAsync(glob.scan({ cwd: expandHome(src.root), absolute: true }))));
      }
    } catch {
      continue;
    }

    for (const file of files) {
      const cacheKey = `${src.id}:${file}`;
      jobs.push(
        limit(async () => {
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
          cacheDirty = true;
          parsed++;
          scanned++;
        }),
      );
    }
  }

  await Promise.all(jobs);
  if (cacheDirty || Object.keys(prev.entries).length !== Object.keys(next).length) {
    await saveCache(next);
  }

  let prompts: Prompt[] = [...loadedPrompts];
  for (const entry of Object.values(next)) prompts.push(...entry.prompts);
  if (!options.agents) prompts = prompts.filter((p) => !p.agent);
  prompts.sort((a, b) => b.ts - a.ts);

  return { prompts, sources: sourceMetas, scanned, parsed, reused };
}
