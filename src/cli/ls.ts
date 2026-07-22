import { parseArgs } from "node:util";
import { applyConfigFilters, configuredSources, loadConfig } from "../config.ts";
import { matchModels } from "../filter.ts";
import { sessionLabel, shortTime } from "../format.ts";
import { search } from "../search.ts";
import { buildIndex } from "../sources/index.ts";
import type { Prompt } from "../types.ts";

const CAP = 100;
const SINCE_UNITS = { h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000 } as const;

export function parseSince(spec: string): number | null {
  const m = /^(\d+)(h|d|w)?$/.exec(spec);
  return m ? Number(m[1]) * SINCE_UNITS[(m[2] ?? "d") as keyof typeof SINCE_UNITS] : null;
}

export function capResults<T>(items: T[], max: number): { shown: T[]; hidden: number } {
  return { shown: items.slice(0, max), hidden: Math.max(0, items.length - max) };
}

export interface HeaderOpts {
  showModel: boolean;
  compact: boolean;
  hasSource: boolean;
}

export function formatRecord(prompt: Prompt, opts: HeaderOpts): string {
  const sid = sessionLabel(prompt.sessionId);
  const tag = prompt.agent ? ["agent"] : [];
  const fields = opts.compact
    ? opts.hasSource
      ? [...tag, sid]
      : [prompt.source, ...tag, sid]
    : [
        prompt.source,
        ...tag,
        ...(opts.showModel ? [prompt.modelLabel] : []),
        prompt.project ?? "?",
        shortTime(prompt.ts),
        sid,
      ];
  return `── ${fields.join(" · ")}\n${prompt.text}`;
}

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      since: { type: "string", short: "s", default: "3d" },
      source: { type: "string" },
      model: { type: "string", short: "m" },
      json: { type: "boolean", default: false },
      raw: { type: "boolean", default: false },
      compact: { type: "boolean", short: "c", default: false },
      agents: { type: "boolean", default: false },
    },
  });

  if (values.compact && values.json) {
    console.error("--compact and --json are mutually exclusive");
    process.exit(1);
  }

  const windowMs = parseSince(values.since!);
  if (windowMs === null) {
    console.error(`invalid --since '${values.since}': expected <n><h|d|w> or a bare <n> for days, e.g. 24h, 3d, 2w, 3`);
    process.exit(1);
  }

  const config = await loadConfig();
  const { prompts } = await buildIndex({ sources: configuredSources(config), agents: values.agents });
  let pool = values.raw ? prompts : applyConfigFilters(prompts, config.filters);

  const now = Date.now();
  const cutoff = now - windowMs;
  pool = pool.filter((p) => p.ts >= cutoff);

  if (values.source) pool = pool.filter((p) => p.source === values.source);

  if (values.model) {
    const labels = [...new Set(pool.map((p) => p.modelLabel))];
    const matched = matchModels(labels, values.model);
    if (matched.length === 0) {
      console.error(`no models matching '${values.model}'; available: ${labels.join(", ") || "(none)"}`);
      process.exit(1);
    }
    const keep = new Set(matched);
    pool = pool.filter((p) => keep.has(p.modelLabel));
  }

  const query = positionals.join(" ").trim();
  const ordered = query ? search(pool, query).map((s) => s.prompt) : [...pool].sort((a, b) => b.ts - a.ts);
  const { shown, hidden } = capResults(ordered, CAP);

  if (shown.length === 0) {
    console.error("no prompts matched");
    return;
  }

  const headerOpts: HeaderOpts = { showModel: !values.model, compact: values.compact!, hasSource: Boolean(values.source) };
  const truncated = `… ${hidden} more, narrow with --since or a query`;

  if (values.json) {
    for (const p of shown) console.log(JSON.stringify(p));
    if (hidden > 0) console.error(truncated);
  } else {
    console.log(shown.map((p) => formatRecord(p, headerOpts)).join("\n\n"));
    if (hidden > 0) console.log(truncated);
  }
}

if (import.meta.main) await run(process.argv.slice(2));
