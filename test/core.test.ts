import { describe, expect, test } from "bun:test";
import { filterPrompts, modelTabs } from "../src/filter.ts";
import { absTime, oneLine, relTime, wrapText } from "../src/format.ts";
import { matchRanges, search } from "../src/search.ts";
import { labelModel } from "../src/sources/model.ts";
import { isBlank, joinTextParts, projectName, promptId, toMs } from "../src/sources/util.ts";
import type { Prompt } from "../src/types.ts";

let seq = 0;

function makePrompt(over: Partial<Prompt> = {}): Prompt {
  seq += 1;
  const source = over.source ?? "claude";
  return {
    id: over.id ?? `id-${seq}`,
    source,
    sourceLabel: over.sourceLabel ?? source,
    model: over.model,
    modelLabel: over.modelLabel ?? "model",
    text: over.text ?? "prompt text",
    ts: over.ts ?? seq,
    cwd: over.cwd,
    project: over.project,
    sessionId: over.sessionId ?? `sess-${seq}`,
    file: over.file ?? `file-${seq}.jsonl`,
  };
}

const none = () => false;

describe("filterPrompts", () => {
  const claude = makePrompt({ source: "claude", modelLabel: "Claude" });
  const codex = makePrompt({ source: "codex", modelLabel: "GPT-5.5" });
  const piOpus = makePrompt({ source: "pi", modelLabel: "Opus 4.8" });
  const piGpt = makePrompt({ source: "pi", modelLabel: "GPT-5.5" });
  const all = [claude, codex, piOpus, piGpt];

  test("'all' returns everything", () => {
    expect(filterPrompts(all, "all", null, none)).toHaveLength(4);
  });

  test("narrows to a single source", () => {
    expect(filterPrompts(all, "claude", null, none)).toEqual([claude]);
  });

  test("favorites tab consults the predicate", () => {
    const isFav = (id: string) => id === codex.id;
    expect(filterPrompts(all, "favorites", null, isFav)).toEqual([codex]);
  });

  test("model filter narrows by label across sources", () => {
    expect(filterPrompts(all, "all", "GPT-5.5", none)).toEqual([codex, piGpt]);
  });

  test("model and source filters combine", () => {
    expect(filterPrompts(all, "pi", "Opus 4.8", none)).toEqual([piOpus]);
  });
});

describe("modelTabs", () => {
  test("orders distinct labels by most recent prompt, not by count", () => {
    const prompts = [
      makePrompt({ modelLabel: "Opus 4.8", ts: 1 }),
      makePrompt({ modelLabel: "Opus 4.8", ts: 2 }),
      makePrompt({ modelLabel: "Opus 4.8", ts: 3 }),
      makePrompt({ modelLabel: "GPT-5.5", ts: 4 }),
    ];
    expect(modelTabs(prompts)).toEqual(["GPT-5.5", "Opus 4.8"]);
  });

  test("a single distinct label yields a one-element list", () => {
    const prompts = [makePrompt({ modelLabel: "Opus 4.8" }), makePrompt({ modelLabel: "Opus 4.8" })];
    expect(modelTabs(prompts)).toHaveLength(1);
  });
});

describe("format helpers", () => {
  const now = 1_000_000_000_000;

  test("relTime handles unknown, future, and scaled units", () => {
    expect(relTime(0, now)).toBe("—");
    expect(relTime(now + 5000, now)).toBe("0s");
    expect(relTime(now - 30 * 1000, now)).toBe("30s");
    expect(relTime(now - 5 * 60_000, now)).toBe("5m");
    expect(relTime(now - 3 * 3_600_000, now)).toBe("3h");
    expect(relTime(now - 2 * 86_400_000, now)).toBe("2d");
    expect(relTime(now - 3 * 7 * 86_400_000, now)).toBe("3w");
    expect(relTime(now - 60 * 86_400_000, now)).toBe("2mo");
    expect(relTime(now - 400 * 86_400_000, now)).toBe("1y");
  });

  test("oneLine collapses whitespace and truncates", () => {
    expect(oneLine("a\n  b\t c", 80)).toBe("a b c");
    expect(oneLine("abcdefgh", 5)).toBe("abcd…");
    expect(oneLine("short", 80)).toBe("short");
  });

  test("wrapText wraps paragraphs and long words", () => {
    expect(wrapText("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);
    expect(wrapText("a\n\nb", 10)).toEqual(["a", "", "b"]);
    expect(wrapText("supercalifragilistic", 5)).toEqual(["super", "calif", "ragil", "istic"]);
  });

  test("absTime reports unknown for falsy timestamps and formats real ones", () => {
    expect(absTime(0)).toBe("unknown");
    expect(absTime(1_700_000_000_000)).not.toBe("unknown");
  });
});

describe("labelModel", () => {
  test("Claude family: single- and double-digit versions, provider-prefixed", () => {
    expect(labelModel("claude-fable-5")).toBe("Fable 5");
    expect(labelModel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(labelModel("claude-opus-4-8")).toBe("Opus 4.8");
    expect(labelModel("anthropic/claude-opus-4-7")).toBe("Opus 4.7");
    expect(labelModel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
  });

  test("GPT family unifies across provider prefixes and keeps suffix words", () => {
    expect(labelModel("gpt-5.5")).toBe("GPT-5.5");
    expect(labelModel("openai/gpt-5.5")).toBe("GPT-5.5");
    expect(labelModel("openai-codex/gpt-5.5")).toBe("GPT-5.5");
    expect(labelModel("gpt-5.6-sol")).toBe("GPT-5.6 Sol");
    expect(labelModel("gpt-5.6-luna-pro")).toBe("GPT-5.6 Luna Pro");
    expect(labelModel("gpt-5.3-codex-spark")).toBe("GPT-5.3 Codex Spark");
    expect(labelModel("gpt-5-codex")).toBe("GPT-5 Codex");
  });

  test("other providers: title-cased, every word kept", () => {
    expect(labelModel("moonshotai/kimi-k2.7-code")).toBe("Kimi K2.7 Code");
    expect(labelModel("deepseek/deepseek-v4-flash")).toBe("DeepSeek V4 Flash");
  });

  test("falls back to provider or 'Unknown' when no model id is known", () => {
    expect(labelModel(undefined, "anthropic")).toBe("Anthropic");
    expect(labelModel(undefined)).toBe("Unknown");
  });
});

describe("search", () => {
  test("returns every prompt unscored for an empty query", () => {
    const prompts = [makePrompt(), makePrompt()];
    const out = search(prompts, "   ");
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.score === 0 && s.matchAt === -1)).toBe(true);
  });

  test("keeps only prompts containing every term", () => {
    const prompts = [makePrompt({ text: "fix the failing build" }), makePrompt({ text: "fix the docs" })];
    const out = search(prompts, "fix build");
    expect(out.map((s) => s.prompt.text)).toEqual(["fix the failing build"]);
  });

  test("ranks phrase matches above scattered terms and breaks ties by recency", () => {
    const phrase = makePrompt({ text: "open the pod bay doors" });
    const scattered = makePrompt({ text: "open every door in the bay pod by pod" });
    expect(search([scattered, phrase], "pod bay")[0].prompt).toBe(phrase);

    const older = makePrompt({ text: "deploy now", ts: 100 });
    const newer = makePrompt({ text: "deploy now", ts: 200 });
    expect(search([older, newer], "deploy now")[0].prompt).toBe(newer);
  });
});

describe("matchRanges", () => {
  test("returns nothing for empty queries or no match", () => {
    expect(matchRanges("anything", "  ")).toEqual([]);
    expect(matchRanges("anything", "zzz")).toEqual([]);
  });

  test("prefers whole-phrase occurrences, case-insensitively", () => {
    expect(matchRanges("Pod bay, pod bay", "pod bay")).toEqual([
      [0, 7],
      [9, 16],
    ]);
  });

  test("falls back to per-term ranges and merges overlaps", () => {
    // "abc" and "cde" never appear adjacently, so terms match separately
    // and their overlapping hits in "abcde" merge into one range.
    expect(matchRanges("abcde xx abc", "abc cde")).toEqual([
      [0, 5],
      [9, 12],
    ]);
  });
});

describe("source util helpers", () => {
  test("toMs normalizes timestamps", () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toMs("2023-11-14T22:13:20.000Z")).toBe(1_700_000_000_000);
    expect(toMs("not a date")).toBe(0);
    expect(toMs(undefined)).toBe(0);
  });

  test("projectName uses path basenames and handles home/missing cwd", () => {
    expect(projectName("/home/me/code/widget")).toBe("widget");
    expect(projectName(process.env.HOME!)).toBe("~");
    expect(projectName(undefined)).toBeUndefined();
  });

  test("joinTextParts flattens only requested part types", () => {
    expect(joinTextParts("hello", ["text"])).toBe("hello");
    const content = [
      { type: "text", text: "keep" },
      { type: "image", text: "drop" },
      { type: "input_text", text: "also keep" },
    ];
    expect(joinTextParts(content, ["text", "input_text"])).toBe("keep\nalso keep");
    expect(joinTextParts({ foo: 1 }, ["text"])).toBe("");
  });

  test("isBlank and promptId behave deterministically", () => {
    expect(isBlank("  \n\t ")).toBe(true);
    expect(isBlank(" x ")).toBe(false);

    const a = promptId("claude", "f.jsonl", 3, "hi");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(promptId("claude", "f.jsonl", 3, "hi")).toBe(a);
    expect(promptId("codex", "f.jsonl", 3, "hi")).not.toBe(a);
    expect(promptId("claude", "g.jsonl", 3, "hi")).not.toBe(a);
    expect(promptId("claude", "f.jsonl", 4, "hi")).not.toBe(a);
    expect(promptId("claude", "f.jsonl", 3, "ho")).not.toBe(a);
  });
});
