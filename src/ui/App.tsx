import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { Prompt, SourceInfo } from "../types.ts";
import type { Favorites } from "../favorites.ts";
import { copyToClipboard } from "../clipboard.ts";
import { matchRanges, search } from "../search.ts";
import {
  MODEL_LABEL,
  MODEL_TABS,
  filterPrompts,
  modelFilterActive,
  sourceTabs,
  type ModelTab,
  type SourceTabInfo,
} from "../filter.ts";
import { tokyoNight as T, colorForSource } from "../theme.ts";
import { absTime, oneLine, relTime, wrapText } from "../format.ts";

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
  const model: ModelTab = MODEL_TABS[modelIdx];
  const showModels = modelFilterActive(source.id, sources);

  const results = React.useMemo(() => {
    const base = filterPrompts(prompts, source.id, model, (id) => favorites.has(id), sources);
    if (!query.trim()) return base;
    return search(base, query).map((s) => s.prompt);
  }, [prompts, source.id, model, query, favTick, favorites, sources]);

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
      return;
    }
    if (showModels && name === "right") return setModelIdx((i) => (i + 1) % MODEL_TABS.length);
    if (showModels && name === "left")
      return setModelIdx((i) => (i - 1 + MODEL_TABS.length) % MODEL_TABS.length);
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
        model={model}
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
        copied={copiedAt > 0}
        width={W}
      />
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
          prompt-picker
        </text>
        <text fg={T.cyan}>{"   ⌕ "}</text>
        <box style={{ flexGrow: 1 }}>
          <text fg={query ? T.fg : T.comment}>{query || "type to search prompts…"}</text>
        </box>
        <text fg={T.comment}>
          {count}/{total}
        </text>
      </box>
      <Rule width={width} />
    </box>
  );
}

function FilterBar({
  tabs,
  active,
  model,
  showModels,
  favCount,
}: {
  tabs: SourceTabInfo[];
  active: string;
  model: ModelTab;
  showModels: boolean;
  favCount: number;
}) {
  return (
    <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, paddingRight: 1 }}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        const label = t.id === "favorites" ? `★ Favorites(${favCount})` : t.label;
        const color = t.color ?? colorForSource(t.id);
        return (
          <box
            key={t.id}
            style={{
              marginRight: 1,
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: isActive ? T.bgSelected : undefined,
            }}
          >
            <text fg={isActive ? color : T.comment} attributes={isActive ? 1 : 0}>
              {label}
            </text>
          </box>
        );
      })}
      {showModels && (
        <box style={{ flexDirection: "row" }}>
          <text fg={T.fgGutter}>{"│ "}</text>
          {MODEL_TABS.map((m) => {
            const isActive = m === model;
            return (
              <box
                key={m}
                style={{
                  marginRight: 1,
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: isActive ? T.bgHighlight : undefined,
                }}
              >
                <text fg={isActive ? T.yellow : T.comment} attributes={isActive ? 1 : 0}>
                  {MODEL_LABEL[m]}
                </text>
              </box>
            );
          })}
        </box>
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
  copied,
  width,
}: {
  position: number;
  count: number;
  showModels: boolean;
  copied: boolean;
  width: number;
}) {
  const keys = [
    "↑↓ nav",
    "tab source",
    showModels ? "←→ model" : "",
    "⌘c copy",
    "↵ favorite",
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
