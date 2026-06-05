import { buildIndex } from "../sources/index.ts";

const t0 = performance.now();
const { prompts, scanned, parsed, reused } = await buildIndex();
const ms = (performance.now() - t0).toFixed(0);

const byAgent: Record<string, number> = {};
const byModel: Record<string, number> = {};
for (const p of prompts) {
  byAgent[p.agent] = (byAgent[p.agent] ?? 0) + 1;
  byModel[p.modelKey] = (byModel[p.modelKey] ?? 0) + 1;
}

console.log(`indexed ${prompts.length} prompts from ${scanned} files in ${ms}ms`);
console.log(`  parsed ${parsed}, reused ${reused} (cache)`);
console.log("by agent:", byAgent);
console.log("by modelKey:", byModel);
console.log("\nnewest 5:");
for (const p of prompts.slice(0, 5)) {
  const when = new Date(p.ts).toISOString().slice(0, 16).replace("T", " ");
  console.log(`  [${p.agent}/${p.modelLabel}] ${when} ${p.project ?? "?"}: ${p.text.slice(0, 70).replace(/\n/g, " ")}`);
}
