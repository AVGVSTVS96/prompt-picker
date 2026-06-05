import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(projectRoot, "node_modules", "@opentui", "core");
const packageJsonPath = join(packageRoot, "package.json");

if (!existsSync(packageJsonPath)) {
  console.warn("[patch-opentui-core] @opentui/core is not installed; skipping");
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };

const patchBlock = `    // prompt-picker patch for OpenTUI destroy ordering bugs #904/#515:
    // mouse tracking must be disabled while stdin is still raw/no-echo.
    if (this._useMouse) {
      this.disableMouse();
      try {
        while (this.stdin.read() !== null) {
        }
      } catch {
      }
    }
`;

let inspected = 0;
let patched = 0;
let alreadySafe = 0;
const failures: string[] = [];

for (const entry of readdirSync(packageRoot)) {
  if (!/^index-[a-z0-9]+\.js$/.test(entry)) continue;

  const file = join(packageRoot, entry);
  const source = readFileSync(file, "utf8");
  const methodStart = source.indexOf("  cleanupBeforeDestroy() {");
  if (methodStart === -1) continue;

  const methodEnd = source.indexOf("  prepareDestroyDuringRender()", methodStart);
  if (methodEnd === -1) {
    failures.push(`${entry}: found cleanupBeforeDestroy() but not prepareDestroyDuringRender()`);
    continue;
  }

  inspected++;
  const method = source.slice(methodStart, methodEnd);
  const rawOff = method.indexOf("setRawMode(false)");
  if (rawOff === -1) {
    // No raw-mode teardown here; nothing to fix in this bundle.
    alreadySafe++;
    continue;
  }

  const disableMouse = method.indexOf("this.disableMouse()");
  if (disableMouse !== -1 && disableMouse < rawOff) {
    alreadySafe++;
    continue;
  }

  const insertAtInMethod = method.indexOf("    this._useMouse = false;");
  if (insertAtInMethod === -1 || insertAtInMethod > rawOff) {
    failures.push(`${entry}: bad destroy order found, but insertion point changed`);
    continue;
  }

  const insertAt = methodStart + insertAtInMethod;
  writeFileSync(file, source.slice(0, insertAt) + patchBlock + source.slice(insertAt));
  patched++;
}

if (failures.length > 0) {
  console.error(`[patch-opentui-core] Could not verify/patch @opentui/core@${version}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

if (inspected === 0) {
  console.warn(`[patch-opentui-core] No OpenTUI renderer bundle found for @opentui/core@${version}; skipping`);
} else if (patched > 0) {
  console.log(`[patch-opentui-core] Patched @opentui/core@${version} destroy mouse cleanup (${patched} file${patched === 1 ? "" : "s"})`);
} else {
  console.log(`[patch-opentui-core] @opentui/core@${version} destroy mouse cleanup already safe (${alreadySafe} file${alreadySafe === 1 ? "" : "s"})`);
}
