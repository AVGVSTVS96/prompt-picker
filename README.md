# prompt-picker

A fast TUI for browsing and searching prompts sent to coding agents.

Currently supports **Claude Code**, **Codex (TUI and GUI)**, and **Pi**
Built with [OpenTUI](https://github.com/sst/opentui).

## What it shows

Only **user prompts you actually typed** — tool results, slash-command
expansions, skill blocks, injected file/branch/compaction context, and shell
(`!`) commands are all filtered out at parse time.

| Source | Location |
| ------ | -------- |
| Claude Code | `~/.claude/projects/*/*.jsonl` |
| Codex | `~/.codex/sessions/**/*.jsonl` |
| Pi | `~/.pi/agent/sessions/*/*.jsonl` |

The model a prompt ran on is read from the **assistant reply** (Claude/Pi) or
the **turn context** (Codex).

## Usage

```bash
git clone https://github.com/avgvstvs96/prompt-picker
cd prompt-picker

bun start
```


| Key | Action |
| --- | ------ |
| type | search prompt text (live) |
| `↑` `↓` / `Ctrl-P` `Ctrl-N` | move selection |
| `PgUp` `PgDn` | page |
| `Tab` / `Shift-Tab` | cycle source: All · Claude · Codex · Pi · ★ Favorites |
| `←` `→` | cycle Pi model filter (All · Opus 4.8 · Opus 4.7 · GPT-5.5) |
| `Enter` / `Ctrl-S` | star / unstar the selected prompt |
| `Ctrl-U` | clear search |
| `Esc` / `Ctrl-C` | quit |


> [!NOTE]
> The model filter only applies while viewing **Pi** sessions.

## Custom filters

Drop a `config.ts` in `~/.config/prompt-picker/` to use custom filters.
Export a `filters` array of predicates, a prompt is shown only if
**every** filter returns true for it.

```ts
// ~/.config/prompt-picker/config.ts
import type { Filter } from "prompt-picker";

export const filters: Filter[] = [
  (p) => p.text.length > 8,              // drop throwaway prompts
  (p) => p.ts > Date.now() - 90 * 864e5, // only the last 90 days
];
```

Each predicate receives a full [`Prompt`](src/types.ts) (`text`, `agent`,
`model`, `ts`, `project`, …), so you can filter on anything.

Filtering runs at load time and never touches the cache, so edits take effect
on the next launch, no reindex. A broken config is reported to stderr and otherwise ignored.

## Performance

Parsed prompts are cached at `~/.config/prompt-picker/index-cache.json`, keyed
by each source file's size + mtime, so only changed sessions are re-parsed on
launch. Search and filtering run in-memory over the full set on every keystroke.

Favorites persist to `~/.config/prompt-picker/favorites.json`.

---

Built by [Bassim](https://x.com/avgvstvs96), with help from Opus 4.8 and GPT-5.5 in [Pi](https://github.com/earendil-works/pi)

