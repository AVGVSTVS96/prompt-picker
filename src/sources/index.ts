import { Glob } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { configDir } from "../config.ts";
import { parseClaude } from "./claude.ts";
import { parseCodex } from "./codex.ts";
import { parsePi } from "./pi.ts";
import type { Agent, FileEntry, Prompt } from "../types.ts";

const HOME = homedir();
const CACHE_DIR = configDir();
const CACHE_FILE = join(CACHE_DIR, "index-cache.json");
const CACHE_VERSION = 8;

interface Source {
  agent: Agent;
  root: string;
  glob: string;
  parse: (file: string, raw: string) => Prompt[];
}

const SOURCES: Source[] = [
  {
    agent: "claude",
    root: join(HOME, ".claude", "projects"),
    glob: "*/*.jsonl",
    parse: parseClaude,
  },
  {
    agent: "codex",
    root: join(HOME, ".codex", "sessions"),
    glob: "**/*.jsonl",
    parse: parseCodex,
  },
  {
    agent: "pi",
    root: join(HOME, ".pi", "agent", "sessions"),
    glob: "*/*.jsonl",
    parse: parsePi,
  },
];

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

export interface IndexResult {
  prompts: Prompt[];
  scanned: number;
  parsed: number;
  reused: number;
}

export async function buildIndex(): Promise<IndexResult> {
  const prev = await loadCache();
  const next: Record<string, FileEntry> = {};
  let parsed = 0;
  let reused = 0;

  const jobs: Promise<void>[] = [];

  for (const src of SOURCES) {
    const glob = new Glob(src.glob);
    let files: string[];
    try {
      files = await Array.fromAsync(glob.scan({ cwd: src.root, absolute: true }));
    } catch {
      continue;
    }

    for (const file of files) {
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

          const cached = prev.entries[file];
          if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
            next[file] = cached;
            reused++;
            return;
          }

          let raw: string;
          try {
            raw = await Bun.file(file).text();
          } catch {
            return;
          }
          const prompts = src.parse(file, raw);
          next[file] = { file, mtimeMs, size, prompts };
          parsed++;
        })(),
      );
    }
  }

  await Promise.all(jobs);
  await saveCache(next);

  const prompts: Prompt[] = [];
  for (const entry of Object.values(next)) prompts.push(...entry.prompts);
  prompts.sort((a, b) => b.ts - a.ts);

  return { prompts, scanned: Object.keys(next).length, parsed, reused };
}
