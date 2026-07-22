import { homedir } from "node:os";
import { join } from "node:path";
import { defineFileSource, type PromptSource } from "./api.ts";
import { parseClaude } from "./claude.ts";
import { parseCodex } from "./codex.ts";
import { parsePi } from "./pi.ts";

export function builtinSources(home = homedir()): PromptSource[] {
  return [
    defineFileSource({
      id: "claude",
      label: "Claude",
      color: "#ff9e64",
      root: join(home, ".claude", "projects"),
      glob: "*/*.jsonl",
      parse: ({ file, raw }) => parseClaude(file, raw),
    }),
    defineFileSource({
      id: "codex",
      label: "Codex",
      color: "#9ece6a",
      root: join(home, ".codex", "sessions"),
      glob: "**/*.jsonl",
      parse: ({ file, raw }) => parseCodex(file, raw),
    }),
    defineFileSource({
      id: "pi",
      label: "Pi",
      color: "#bb9af7",
      root: join(home, ".pi", "agent", "sessions"),
      glob: "*/*.jsonl",
      parse: ({ file, raw }) => parsePi(file, raw),
    }),
  ];
}
