import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { Prompt, SourceInfo } from "../types.ts";
import type { Favorites } from "../favorites.ts";
import { copyToClipboard } from "../clipboard.ts";
import { matchRanges, search } from "../search.ts";
import { INLINE_MODEL_TABS, filterPrompts, modelTabs, sourceTabs, type SourceTabInfo } from "../filter.ts";
import { tokyoNight as T, colorForSource } from "../theme.ts";
import { absTime, oneLine, relTime, wrapText } from "../format.ts";
import { SearchInput } from "./SearchInput.tsx";

interface Props {
  prompts: Prompt[];
  sources: SourceInfo[];
  favorites: Favorites;
  now: number;
  onExit: () => void;
}

export function App({ prompts, sources, favorites, now, onExit }: Props) {
  const dims = useTerminalDimensions();
  const W = dims.width;
  const H = dims.height;

  const tabs = React.useMemo(() => sourceTabs(sources), [sources]);
  const [query, setQuery] = React.useState("");
  const [sourceIdx, setSourceIdx] = React.useState(0);
  const [modelIdx, setModelIdx] = React.useState(0);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState("");
  const [pickerIdx, setPickerIdx] = React.useState(0);
  const [selected, setSelected] = React.useState(0);
  const [favTick, setFavTick] = React.useState(0);
  const [copiedAt, setCopiedAt] = React.useState(0);

  React.useEffect(() => {
    if (!copiedAt) return;
    const t = setTimeout(() => setCopiedAt(0), 1500);
    return () => clearTimeout(t);
  }, [copiedAt]);

  React.useEffect(() => {
    setSourceIdx((i) => Math.min(i, Math.max(0, tabs.length - 1)));
  }, [tabs.length]);

  const source = tabs[sourceIdx] ?? tabs[0];

  const models = React.useMemo(
    () => modelTabs(filterPrompts(prompts, source.id, null, (id) => favorites.has(id))),
    [prompts, source.id, favTick, favorites],
  );
  const options: (string | null)[] = [null, ...models];
  const showModels = models.length >= 2;
  const fold = options.length > INLINE_MODEL_TABS + 2;
  const inline = fold ? options.slice(0, 1 + INLINE_MODEL_TABS) : options;
  // With a fold, the Other chip is one extra stop in the ←/→ cycle.
  const stops = inline.length + (fold ? 1 : 0);
  const onOther = fold && modelIdx === inline.length;
  const model = showModels ? (onOther ? picked : (inline[modelIdx] ?? null)) : null;

  React.useEffect(() => {
    setModelIdx((i) => Math.min(i, Math.max(0, stops - 1)));
  }, [stops]);

  const pickerLabels = React.useMemo(
    () => models.filter((m) => m.toLowerCase().includes(pickerQuery.toLowerCase())),
    [models, pickerQuery],
  );

  function closePicker() {
    setPickerOpen(false);
    setPickerQuery("");
    setPickerIdx(0);
  }

  function applyModel(label: string) {
    const i = inline.indexOf(label);
    if (i >= 0) {
      setModelIdx(i);
      setPicked(null);
    } else {
      setModelIdx(inline.length);
      setPicked(label);
    }
    closePicker();
  }

  const results = React.useMemo(() => {
    const base = filterPrompts(prompts, source.id, model, (id) => favorites.has(id));
    if (!query.trim()) return base;
    return search(base, query).map((s) => s.prompt);
  }, [prompts, source.id, model, query, favTick, favorites]);

  React.useEffect(() => {
    setSelected(0);
  }, [source.id, model, query]);

  React.useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, results.length - 1)));
  }, [results.length]);

  const current: Prompt | undefined = results[selected];

  const headerH = 2;
  const filterH = 1;
  const footerH = 2;
  const mainH = Math.max(3, H - headerH - filterH - footerH);
  const listWidth = Math.max(26, Math.floor(W * 0.46));

  const scrollStart = Math.max(
    0,
    Math.min(selected - Math.floor(mainH / 2), Math.max(0, results.length - mainH)),
  );
  const visible = results.slice(scrollStart, scrollStart + mainH);

  function move(delta: number) {
    setSelected((s) => Math.min(Math.max(0, s + delta), Math.max(0, results.length - 1)));
  }

  useKeyboard((k) => {
    const name = k.name;
    if (pickerOpen) {
      if (name === "escape") return closePicker();
      if (name === "up" || (k.ctrl && name === "p")) return setPickerIdx((i) => Math.max(0, i - 1));
      if (name === "down" || (k.ctrl && name === "n"))
        return setPickerIdx((i) => Math.min(Math.max(0, pickerLabels.length - 1), i + 1));
      if (name === "return") {
        const label = pickerLabels[pickerIdx];
        if (label) applyModel(label);
        return;
      }
      if (k.ctrl && name === "u") {
        setPickerQuery("");
        return setPickerIdx(0);
      }
      if (name === "backspace") {
        setPickerQuery((q) => q.slice(0, -1));
        return setPickerIdx(0);
      }
      if (!k.ctrl && !k.meta && k.sequence?.length === 1 && k.sequence >= " " && k.sequence !== "\x7f") {
        setPickerQuery((q) => q + k.sequence);
        setPickerIdx(0);
      }
      return;
    }
    if (name === "escape") return onExit();
    if ((k.meta || k.super) && name === "c") {
      if (current) {
        void copyToClipboard(current.text).then((ok) => ok && setCopiedAt(Date.now()));
      }
      return;
    }
    if (name === "up" || (k.ctrl && name === "p")) return move(-1);
    if (name === "down" || (k.ctrl && name === "n")) return move(1);
    if (name === "pageup") return move(-(mainH - 1));
    if (name === "pagedown") return move(mainH - 1);
    if (k.ctrl && name === "u") return setQuery("");
    if (name === "tab") {
      const dir = k.shift ? -1 : 1;
      setSourceIdx((i) => (i + dir + tabs.length) % tabs.length);
      setModelIdx(0);
      setPicked(null);
      return;
    }
    if (showModels && name === "right") return setModelIdx((i) => (i + 1) % stops);
    if (showModels && name === "left") return setModelIdx((i) => (i - 1 + stops) % stops);
    if (name === "return" && onOther) return setPickerOpen(true);
    if (name === "return" || (k.ctrl && name === "s")) {
      if (current) {
        favorites.toggle(current.id);
        setFavTick((t) => t + 1);
      }
      return;
    }
    if (name === "backspace") return setQuery((q) => q.slice(0, -1));
    if (!k.ctrl && !k.meta && k.sequence && k.sequence.length === 1) {
      const ch = k.sequence;
      if (ch >= " " && ch !== "\x7f") setQuery((q) => q + ch);
    }
  });

  return (
    <box style={{ flexDirection: "column", width: W, height: H, backgroundColor: T.bg }}>
      <Header query={query} count={results.length} total={prompts.length} width={W} />
      <FilterBar
        tabs={tabs}
        active={source.id}
        inline={inline}
        modelIdx={modelIdx}
        showOther={fold}
        picked={picked}
        showModels={showModels}
        favCount={favorites.size}
      />
      <box style={{ flexDirection: "row", width: W, height: mainH }}>
        <box
          style={{
            width: listWidth,
            height: mainH,
            flexDirection: "column",
            borderStyle: "single",
            border: ["right"],
            borderColor: T.border,
          }}
        >
          {visible.length === 0 ? (
            <text fg={T.comment} style={{ paddingLeft: 1 }}>
              no prompts match
            </text>
          ) : (
            visible.map((p, i) => (
              <Row
                key={p.id}
                p={p}
                sources={sources}
                now={now}
                query={query}
                width={listWidth - 1}
                selected={scrollStart + i === selected}
                fav={favorites.has(p.id)}
              />
            ))
          )}
        </box>

        <Detail
          prompt={current}
          sources={sources}
          fav={current ? favorites.has(current.id) : false}
          query={query}
          width={W - listWidth}
          height={mainH}
        />
      </box>
      <Footer
        position={results.length ? selected + 1 : 0}
        count={results.length}
        showModels={showModels}
        pickerOpen={pickerOpen}
        onOther={onOther}
        copied={copiedAt > 0}
        width={W}
      />
      {pickerOpen && (
        <ModelPicker
          labels={pickerLabels}
          total={models.length}
          maxLabel={Math.max(...models.map((m) => m.length))}
          query={pickerQuery}
          selected={pickerIdx}
          screenW={W}
          screenH={H}
        />
      )}
    </box>
  );
}

function Highlight({ text, query, fg }: { text: string; query: string; fg: string }) {
  const ranges = query ? matchRanges(text, query) : [];
  if (ranges.length === 0) return <text fg={fg}>{text}</text>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([start, end], i) => {
    if (start > pos) {
      parts.push(
        <text key={`t${i}`} fg={fg}>
          {text.slice(pos, start)}
        </text>,
      );
    }
    parts.push(
      <text key={`m${i}`} fg={T.yellow} attributes={1}>
        {text.slice(start, end)}
      </text>,
    );
    pos = end;
  });
  if (pos < text.length) {
    parts.push(
      <text key="tail" fg={fg}>
        {text.slice(pos)}
      </text>,
    );
  }
  return <>{parts}</>;
}

function Rule({ width, color = T.border }: { width: number; color?: string }) {
  return (
    <box style={{ height: 1, width }}>
      <text fg={color}>{"─".repeat(Math.max(0, width))}</text>
    </box>
  );
}

function Header({
  query,
  count,
  total,
  width,
}: {
  query: string;
  count: number;
  total: number;
  width: number;
}) {
  return (
    <box style={{ flexDirection: "column", width, height: 2 }}>
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, paddingRight: 1 }}>
        <text fg={T.magenta} attributes={1}>
          {"prompt-picker   "}
        </text>
        <SearchInput query={query} placeholder="type to search prompts…" />
        <text fg={T.comment}>
          {count}/{total}
        </text>
      </box>
      <Rule width={width} />
    </box>
  );
}

function Chip({
  label,
  active,
  color = T.yellow,
  activeBg = T.bgHighlight,
}: {
  label: string;
  active: boolean;
  color?: string;
  activeBg?: string;
}) {
  return (
    <box
      style={{ marginRight: 1, paddingLeft: 1, paddingRight: 1, backgroundColor: active ? activeBg : undefined }}
    >
      <text fg={active ? color : T.comment} attributes={active ? 1 : 0}>
        {label}
      </text>
    </box>
  );
}

function FilterBar({
  tabs,
  active,
  inline,
  modelIdx,
  showOther,
  picked,
  showModels,
  favCount,
}: {
  tabs: SourceTabInfo[];
  active: string;
  inline: (string | null)[];
  modelIdx: number;
  showOther: boolean;
  picked: string | null;
  showModels: boolean;
  favCount: number;
}) {
  return (
    <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, paddingRight: 1 }}>
      {tabs.map((t) => (
        <Chip
          key={t.id}
          label={t.id === "favorites" ? `★ Favorites(${favCount})` : t.label}
          active={t.id === active}
          color={t.color ?? colorForSource(t.id)}
          activeBg={T.bgSelected}
        />
      ))}
      {showModels && (
        <box style={{ flexDirection: "row" }}>
          <text fg={T.fgGutter}>{"│ "}</text>
          {inline.map((m, i) => (
            <Chip key={m ?? "all"} label={m ?? "All models"} active={i === modelIdx} />
          ))}
          {showOther && (
            <Chip
              label={picked ? `Other: ${picked}` : "Other ▾"}
              active={modelIdx === inline.length}
            />
          )}
        </box>
      )}
    </box>
  );
}

const PICKER_VISIBLE_ROWS = 10;

function ModelPicker({
  labels,
  total,
  maxLabel,
  query,
  selected,
  screenW,
  screenH,
}: {
  labels: string[];
  total: number;
  maxLabel: number;
  query: string;
  selected: number;
  screenW: number;
  screenH: number;
}) {
  // Explicit geometry: absolute boxes must not rely on intrinsic sizing.
  const rows = Math.max(1, Math.min(total, PICKER_VISIBLE_ROWS));
  const width = Math.min(Math.max(0, screenW - 8), Math.max(32, maxLabel + 8));
  const height = rows + 4;
  const innerW = width - 2;
  const start = Math.max(0, Math.min(selected - Math.floor(rows / 2), labels.length - rows));
  const visible = labels.slice(start, start + rows);

  return (
    <box
      style={{
        position: "absolute",
        left: Math.max(0, Math.floor((screenW - width) / 2)),
        top: Math.max(0, Math.floor((screenH - height) / 2)),
        width,
        height,
        zIndex: 100,
        flexDirection: "column",
        backgroundColor: T.bgDark,
        borderStyle: "single",
        borderColor: T.border,
      }}
    >
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, paddingRight: 1 }}>
        <SearchInput query={query} placeholder="filter models…" />
      </box>
      <Rule width={innerW} />
      {visible.length === 0 ? (
        <text fg={T.comment} style={{ paddingLeft: 2 }}>
          no models match
        </text>
      ) : (
        visible.map((m, i) => {
          const sel = start + i === selected;
          return (
            <box
              key={m}
              style={{
                flexDirection: "row",
                height: 1,
                width: innerW,
                backgroundColor: sel ? T.bgSelected : undefined,
              }}
            >
              <text fg={sel ? T.magenta : T.bgDark}>{sel ? "▌" : " "}</text>
              <text fg={sel ? T.fg : T.fgDark}>{" " + m}</text>
            </box>
          );
        })
      )}
    </box>
  );
}

function Row({
  p,
  sources,
  now,
  query,
  width,
  selected,
  fav,
}: {
  p: Prompt;
  sources: SourceInfo[];
  now: number;
  query: string;
  width: number;
  selected: boolean;
  fav: boolean;
}) {
  const badge = colorForSource(p.source, sources);
  const rowMetaWidth = 16;
  const previewMax = Math.max(6, width - rowMetaWidth);
  const preview = oneLine(p.text.slice(0, previewMax * 4), previewMax);
  const sourceLabel = oneLine(p.sourceLabel || p.source, 7).padEnd(7);
  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        width,
        overflow: "hidden",
        backgroundColor: selected ? T.bgSelected : undefined,
      }}
    >
      <text fg={selected ? T.magenta : T.bg}>{selected ? "▌" : " "}</text>
      <text fg={fav ? T.yellow : T.fgGutter}>{fav ? "★" : "·"}</text>
      <text fg={badge}>{" " + sourceLabel}</text>
      <text fg={T.comment}>{relTime(p.ts, now).padStart(4) + " "}</text>
      <Highlight text={preview} query={query} fg={selected ? T.fg : T.fgDark} />
    </box>
  );
}

function Detail({
  prompt,
  sources,
  fav,
  query,
  width,
  height,
}: {
  prompt: Prompt | undefined;
  sources: SourceInfo[];
  fav: boolean;
  query: string;
  width: number;
  height: number;
}) {
  if (!prompt) {
    return (
      <box style={{ width, height, paddingLeft: 2 }}>
        <text fg={T.comment}>—</text>
      </box>
    );
  }
  const badge = colorForSource(prompt.source, sources);
  const bodyH = Math.max(1, height - 3);
  const innerW = Math.max(10, width - 3);
  const lines = wrapText(prompt.text.slice(0, innerW * bodyH * 4), innerW).slice(0, bodyH);
  return (
    <box style={{ width, height, flexDirection: "column", paddingLeft: 2, paddingRight: 1 }}>
      <box style={{ flexDirection: "row", height: 1 }}>
        <text fg={badge} attributes={1}>
          {(prompt.sourceLabel || prompt.source).toUpperCase()}
        </text>
        <text fg={T.comment}>{"  ·  "}</text>
        <text fg={T.yellow}>{prompt.modelLabel}</text>
        <text fg={T.comment}>{"  ·  "}</text>
        <text fg={T.green}>{oneLine(prompt.sessionId, Math.max(8, innerW - 24))}</text>
        {fav ? <text fg={T.yellow}>{"  ★ favorite"}</text> : null}
      </box>
      <box style={{ flexDirection: "row", height: 1 }}>
        <text fg={T.cyan}>{absTime(prompt.ts)}</text>
        <text fg={T.comment}>{"   "}</text>
        <text fg={T.blue}>{prompt.project ?? prompt.cwd ?? ""}</text>
      </box>
      <box style={{ height: 1 }} />
      <box style={{ flexDirection: "column", height: bodyH, width: innerW, overflow: "hidden" }}>
        {lines.map((ln, i) => (
          <box key={i} style={{ flexDirection: "row", height: 1, overflow: "hidden" }}>
            <Highlight text={ln || " "} query={query} fg={T.fg} />
          </box>
        ))}
      </box>
    </box>
  );
}

function Footer({
  position,
  count,
  showModels,
  pickerOpen,
  onOther,
  copied,
  width,
}: {
  position: number;
  count: number;
  showModels: boolean;
  pickerOpen: boolean;
  onOther: boolean;
  copied: boolean;
  width: number;
}) {
  const keys = pickerOpen
    ? ["↑↓ nav", "↵ apply", "esc close", "type filter"]
    : [
        "↑↓ nav",
        "tab source",
        showModels ? "←→ model" : "",
        "⌘c copy",
        onOther ? "↵ pick model" : "↵ favorite",
        onOther ? "^s favorite" : "",
        "type search",
        "esc/^c quit",
      ].filter(Boolean);
  return (
    <box style={{ flexDirection: "column", width, height: 2 }}>
      <Rule width={width} />
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, paddingRight: 1 }}>
        <text fg={T.comment}>{keys.join("  ·  ")}</text>
        <box style={{ flexGrow: 1 }} />
        {copied ? <text fg={T.green}>{"copied ✓  "}</text> : null}
        <text fg={T.fgGutter}>
          {position}/{count}
        </text>
      </box>
    </box>
  );
}
