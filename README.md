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
| `←` `→` | cycle model filter (derived from what's loaded, most recent first) |
| `Enter` / `Ctrl-S` | star / unstar the selected prompt |
| `Enter` on `Other` chip | open the model picker (type to filter, `↑` `↓` select, `Enter` apply) |
| `Ctrl-U` | clear search |
| `Esc` / `Ctrl-C` | close the model picker if open, otherwise quit |


> [!NOTE]
> The model filter tabs are derived from whatever models show up in the
> current view (any source, including All and Favorites) and only appear
> once 2+ distinct models are present, ordered by most recent use. Beyond
> the first 3 they fold behind an `Other` chip — `Enter` on it opens a
> searchable picker of every model in the view.

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

Each predicate receives a full [`Prompt`](src/types.ts) (`text`, `source`,
`model`, `ts`, `project`, …), so you can filter on anything.

Filtering runs at load time and never touches the cache, so edits take effect
on the next launch, no reindex. A broken config is reported to stderr and otherwise ignored.

## Custom sources

Claude, Codex, and Pi ship as built-in sources, but they are not special — they
use the same public API any config can use. Add your own local prompt sources
by exporting a config **factory** from `config.ts`. The factory receives the
source API and returns `{ filters, sources, includeBuiltins }`.

`defineFileSource` scans files on disk and parses them into prompts. Use
`makePrompt` to fill in stable ids, timestamps, project names, and model
labels for you:

```ts
// ~/.config/prompt-picker/config.ts
import type { ConfigApi } from "prompt-picker";

export default ({ defineFileSource, makePrompt }: ConfigApi) => ({
  sources: [
    defineFileSource({
      id: "cursor",
      label: "Cursor",
      color: "#7aa2f7",   // optional tab/badge color
      root: "~/.cursor/chats",
      glob: "**/*.jsonl",
      parse({ file, raw }) {
        return raw
          .split("\n")
          .flatMap((line, lineNumber) => {
            if (!line.trim()) return [];
            const event = JSON.parse(line);
            if (event.role !== "user") return [];
            return makePrompt({
              source: "cursor",
              file,
              line: lineNumber,
              text: event.content,
              ts: event.timestamp,
              cwd: event.cwd,
              sessionId: event.session_id,
              model: event.model,     // formatted into a display label
            });
          });
      },
    }),
  ],
});
```

For prompts that don't come from files on disk (generated data, a SQLite
history, an API), use `defineSource` and return the prompts directly:

```ts
import type { ConfigApi } from "prompt-picker";

export default ({ defineSource, makePrompt }: ConfigApi) => ({
  sources: [
    defineSource({
      id: "notes",
      label: "Notes",
      async load() {
        return [
          makePrompt({
            source: "notes",
            file: "manual",
            text: "Review this architecture for accidental complexity.",
            ts: Date.now(),
          }),
        ];
      },
    }),
  ],
});
```

Custom sources are merged after the built-ins and each gets its own tab. The
model filter tabs appear automatically once a view has 2+ distinct models,
no configuration needed. Return `includeBuiltins: false` to replace the
built-in sources entirely — useful for a demo dataset:

```ts
export default ({ defineSource, makePrompt }: ConfigApi) => {
  const demo = Bun.argv.includes("--fake-prompts");
  return {
    includeBuiltins: !demo,
    sources: demo ? [/* defineSource(...) */] : [],
  };
};
```

File sources are cached by size + mtime per file; `defineSource` loaders run on
every launch. A broken source is reported to stderr and skipped.

## Performance

Parsed prompts are cached at `~/.config/prompt-picker/index-cache.json`, keyed
by each source file's size + mtime, so only changed sessions are re-parsed on
launch. Search and filtering run in-memory over the full set on every keystroke.

Favorites persist to `~/.config/prompt-picker/favorites.json`.

---

Built by [Bassim](https://x.com/avgvstvs96), with help from Opus 4.8 and GPT-5.5 in [Pi](https://github.com/earendil-works/pi)

