# Generating screenshots, GIFs, and videos

All demo media is rendered with [vhs](https://github.com/charmbracelet/vhs) (`brew install vhs`) from a scripted tape — deterministic, no manual window capture.

```sh
cd demo && rm -f config/prompt-picker/favorites.json && vhs demo.tape
```

Takes ~90s. Outputs land in `demo/`: `demo.gif`, `demo.mp4`, and four PNGs (`home`, `search`, `pimodels`, `favorites`).

## How it works

- `demo/demo.tape` — the vhs script: terminal setup (Tokyo Night theme, 2600×1440 at font size 30 = 2x density, crisp on retina/4K), then scripted keystrokes with `Screenshot` commands at key moments.
- `demo/config/prompt-picker/` — a fake `XDG_CONFIG_HOME`. The tape launches the app with `XDG_CONFIG_HOME=$PWD/demo/config`, so the app loads `config.ts` there instead of the user's real config. That config defines three `load`-type sources (Claude/Codex/Pi) returning ~34 hand-written fake prompts with `Date.now()`-relative timestamps — real user data never appears on screen.
- The app writes `favorites.json` and `index-cache.json` into that config dir at runtime (gitignored). Delete `favorites.json` before rendering — the tape toggles two favorites and a stale file inverts the sequence.

## Editing

- **Change what's shown**: edit the fake prompts in `demo/config/prompt-picker/config.ts`.
- **Change the choreography**: edit `demo.tape`. Keys: `Type`, `Enter`, `Tab`, `Down`, `Right`, `Ctrl+U`, `Escape`, `Sleep 800ms`, `Screenshot name.png`.
- **Resolution**: scale `FontSize`, `Width`, `Height`, `Padding`, `BorderRadius` together (currently 2x; halve all for 1x).

## vhs gotchas (each cost a failed render)

- `Output`/`Screenshot` paths must be bare relative filenames — absolute paths and hyphens in filenames break the tape parser. Run vhs from `demo/`.
- Tape strings can't contain escaped quotes (`\"`). Keep shell commands quote-free inside `Type "..."`.
- The app run is wrapped in `Hide`/`Show` so the launch command isn't in the recording; end with `Escape` (quit) before the final `Hide` so the app exits cleanly.
- GIF at 2x is ~5MB; prefer `demo.mp4` (~2MB, better quality) when embedding somewhere size-sensitive.

## Verifying output

Screenshots are PNGs — view them directly (agents: use the Read tool on the PNG) and check: search-term highlighting in list + detail, footer keybind hints, favorites count. `sips -g pixelWidth demo/home.png` should report 2600.
