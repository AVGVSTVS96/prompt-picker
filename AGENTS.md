# prompt-picker

A fast TUI and CLI for searching and browsing prompts sent to coding agents.

Currently supports **Claude Code**, **Codex (TUI and GUI)**, and **Pi**.
Built with [OpenTUI](https://github.com/sst/opentui), runs on Bun.

**What it shows**

Only **user prompts you actually typed;** tool results, shell (`!`) commands,
slash-command expansions, skill blocks, injected file/branch/compaction
context, and system reminders are filtered by default.

Two more classes are parsed, tagged, and hidden unless asked for:

| Tag | Meaning | Opt in |
| --- | ------- | ------ |
| `agent` | written by an agent or app, not a human (subagent transcripts, SDK sessions) | `--agents` |
| `unsent` | never got a reply; session killed, quit, or errored | `--unsent` |

**Modularity and extensibility**

The philosophy of prompt-picker is to be simple, fast, and extensible.
Users can filter prompts by source tab, model, favorites, and free-text
search in the TUI, and by `--since` / `--source` / `--model` / query on the
CLI. Users can also drop a `config.ts` in `~/.config/prompt-picker/` to add
arbitrary predicate filters, register their own prompt sources, or replace
the built-ins entirely.

The built-ins are **not privileged**: Claude, Codex, and Pi are defined with
the same `defineFileSource` / `makePrompt` API that any user config gets.
Anything a built-in can do, a config can do.

This simple philosophy is core to this project and should never be broken;
always prefer extensibility over added features/complexity. When a feature
could be a config hook instead of a flag, make it a config hook.

**Demos**

`demo/` holds the scripted vhs recordings and screenshots used in the README,
rendered from fake prompt data so real user sessions never appear on screen.
See [demo/DEMO.md](demo/DEMO.md) before touching any of it.

---

## Commands

```bash
bun start          # launch the TUI
bun test           # all tests (bun:test)
bun run typecheck  # tsc --noEmit
bun run ls -- ...  # CLI list mode directly
bun run index      # rebuild the index cache, print stats
```

`bun install` runs `scripts/patch-opentui-core.ts` as a postinstall step.

## Layout

```
src/
  index.tsx        TUI entry: loads data, boots the OpenTUI renderer
  cli/pk.ts        bin entry: TTY -> TUI, piped or with args -> ls
  cli/ls.ts        list mode: arg parsing, filtering, record formatting
  cli/reindex.ts   force a cache rebuild
  config.ts        PUBLIC API (package `exports`) + user config loading
  types.ts         Prompt, SourceInfo, FileEntry
  sources/
    api.ts         defineFileSource / defineSource / makePrompt
    builtins.ts    the three shipped sources, declared via that same API
    index.ts       buildIndex: glob, cache, parse, merge, sort
    claude.ts      per-agent parsers, one file each
    codex.ts
    pi.ts
    model.ts       raw model id -> display label
    util.ts        promptId, projectName, toMs, text-part flattening
  search.ts        scoring + match ranges for highlighting
  filter.ts        source tabs, model tabs, model query matching
  format.ts        time, wrapping, truncation, session labels
  favorites.ts     starred ids, persisted to the config dir
  ui/App.tsx       the whole TUI (list, detail, filter bar, model picker)
test/
  parsers.test.ts  one describe per source, fed raw JSONL fixtures
  core.test.ts     search, filter, format, model labels, util
  cli.test.ts      arg parsing, capping, record formatting
```

Everything user-writable lives in one directory, `configDir()` from
`src/paths.ts` (`$XDG_CONFIG_HOME/prompt-picker`, else `~/.config/...`):
`config.ts`, `index-cache.json`, `favorites.json`.

## Data flow

```
sources  ──glob──>  files  ──parse──>  Prompt[]  ──cache──>  index-cache.json
                                          │
config.ts filters ────────────────────────┤
                                          v
                            TUI (App.tsx)  or  CLI (ls.ts)
                                          │
                            search() -> filterPrompts() -> render
```

`buildIndex()` is the single ingest path; the TUI and CLI both call it and
differ only in what they do with the result. Search and filtering run
in-memory over the full set on every keystroke, no index structure.

## Invariants

**Bump `CACHE_VERSION` in `src/sources/index.ts`** whenever a parser's
behavior or the `Prompt` shape changes. The cache stores parser *output*
keyed by file size + mtime, so stale entries survive indefinitely until the
source file itself changes. A parser fix with no version bump is invisible
to every existing user.

**Filter non-prompts at parse time**, inside the source parser, not
downstream. The rest of the pipeline assumes every `Prompt` it sees is real
user text. Borderline items get tagged (`agent`, `unsent`) rather than
dropped, so they stay recoverable behind a flag.

**Model comes from the reply, not the request.** Claude and Pi read it from
the nearest assistant message after the prompt; Codex reads the turn context.
No reply model means the prompt was never answered, which is exactly how
`unsent` is derived. Do not invent a model from config defaults.

**`src/config.ts` is public API.** It is the package `exports` entry, so
every type and function re-exported there is something user configs import.
Treat changes to it as breaking.

**Never hand-edit `node_modules/@opentui/core`.** `scripts/patch-opentui-core.ts`
patches a destroy-ordering bug (mouse tracking must be disabled while stdin
is still raw) and is idempotent, version-tolerant, and fails loudly if the
upstream shape changed. Fix the script instead.

**Startup time is a feature.** `src/index.tsx` deliberately overlaps data
loading with the OpenTUI import and defers everything heavy behind dynamic
`import()`. Measure with `PP_STARTUP=1 bun start`, which renders once and
prints the time to first render.

## Adding a source

1. Write `src/sources/<id>.ts` exporting `parse<Id>(file, raw): Prompt[]`,
   building each record with `makePrompt` so ids, timestamps, project names,
   and model labels stay consistent.
2. Register it in `src/sources/builtins.ts` with an id, label, color, root,
   and glob.
3. Add a `describe` block in `test/parsers.test.ts` with raw JSONL fixtures
   covering: a normal prompt, a tool result, an injected/system record, and
   a prompt with no reply.
4. Bump `CACHE_VERSION`.
5. Update the source table in `README.md`.

Reach for the shared helpers in `sources/util.ts` (`joinTextParts`,
`isBlank`, `toMs`) rather than re-implementing per-source parsing quirks.

## Conventions

- Bun-first: `Bun.file`, `Bun.write`, `Bun.Glob`, `bun:test`. No Node fs
  unless it is `mkdirSync` for a directory that must exist before a write.
- `.ts` / `.tsx` extensions on every relative import.
- Named exports; no default exports outside user-facing config examples.
- Missing files, unreadable files, broken user configs, and failing custom
  sources are all non-fatal: log to stderr and skip. The app must still open.
- Comments explain *why*, especially for the non-obvious ordering and
  filtering rules. Keep them short; do not narrate the code.
- Tokyo Night is the only theme, in `src/theme.ts`. Sources may override
  their own color; nothing else picks colors inline.
- Prefer pure functions in `search.ts` / `filter.ts` / `format.ts` so they
  stay directly testable; `App.tsx` should hold state and layout, not logic.

## Docs to keep in sync

`README.md` is the user-facing contract: keybindings, CLI flags, config API.
Any change to a flag, a keybinding, an exported type, or the config surface
needs a matching README edit in the same change.
