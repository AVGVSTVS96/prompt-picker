#!/usr/bin/env bun
export {};

const args = process.argv.slice(2);
const wantsLs = args[0] === "ls";
const lsArgs = wantsLs ? args.slice(1) : args;

if (wantsLs || args.length > 0 || !process.stdout.isTTY) {
  const { run } = await import("./ls.ts");
  await run(lsArgs);
} else {
  await import("../index.tsx");
}
