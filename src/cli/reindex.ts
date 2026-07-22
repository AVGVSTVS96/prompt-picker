import { configuredSources, loadConfig } from "../config.ts";
import { buildIndex } from "../sources/index.ts";

const config = await loadConfig();
const sources = configuredSources(config);

const t0 = performance.now();
const { prompts, scanned, parsed, reused } = await buildIndex({ sources });
const ms = (performance.now() - t0).toFixed(0);

const bySource: Record<string, number> = {};
const byModel: Record<string, number> = {};
for (const p of prompts) {
  bySource[p.source] = (bySource[p.source] ?? 0) + 1;
  byModel[p.modelLabel] = (byModel[p.modelLabel] ?? 0) + 1;
}

console.log(`indexed ${prompts.length} prompts from ${scanned} files/sources in ${ms}ms`);
console.log(`  parsed ${parsed}, reused ${reused} (cache)`);
console.log("by source:", bySource);
console.log("by modelLabel:", byModel);
console.log("\nnewest 5:");
for (const p of prompts.slice(0, 5)) {
  const when = new Date(p.ts).toISOString().slice(0, 16).replace("T", " ");
  console.log(`  [${p.source}/${p.modelLabel}] ${when} ${p.project ?? "?"}: ${p.text.slice(0, 70).replace(/\n/g, " ")}`);
}
