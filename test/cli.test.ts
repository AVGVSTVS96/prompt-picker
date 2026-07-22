import { describe, expect, test } from "bun:test";
import { capResults, formatRecord, parseSince, type HeaderOpts } from "../src/cli/ls.ts";
import { matchModels } from "../src/filter.ts";
import { sessionLabel, shortTime } from "../src/format.ts";
import type { Prompt } from "../src/types.ts";

describe("parseSince", () => {
  test("parses hours, days, weeks", () => {
    expect(parseSince("24h")).toBe(24 * 3_600_000);
    expect(parseSince("3d")).toBe(3 * 86_400_000);
    expect(parseSince("2w")).toBe(2 * 7 * 86_400_000);
  });

  test("bare numbers mean days", () => {
    expect(parseSince("3")).toBe(3 * 86_400_000);
    expect(parseSince("0")).toBe(0);
  });

  test("rejects bad input", () => {
    expect(parseSince("3x")).toBeNull();
    expect(parseSince("d3")).toBeNull();
    expect(parseSince("")).toBeNull();
    expect(parseSince("-3d")).toBeNull();
  });
});

describe("capResults", () => {
  test("keeps items under the cap untouched", () => {
    expect(capResults([1, 2, 3], 100)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });

  test("truncates and reports the remainder", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const { shown, hidden } = capResults(items, 100);
    expect(shown).toHaveLength(100);
    expect(hidden).toBe(20);
  });
});

describe("matchModels", () => {
  const claudeLabels = ["Fable 5", "Opus 4.7", "Sonnet 4.8"];
  const gptLabels = ["GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna", "GPT-5.5"];

  test("plain substring match", () => {
    expect(matchModels(claudeLabels, "fable")).toEqual(["Fable 5"]);
  });

  test("no digits: keeps only the highest version among matches", () => {
    expect(matchModels(gptLabels, "gpt")).toEqual(["GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna"]);
  });

  test("exact version query: keeps only that version", () => {
    expect(matchModels(claudeLabels, "opus-4.7")).toEqual(["Opus 4.7"]);
  });

  test("digits present: keeps the full union of variants at that version", () => {
    expect(matchModels(gptLabels, "gpt-5.6")).toEqual(["GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna"]);
  });

  test("separators are equivalent: '-', '.', and space normalize the same", () => {
    expect(matchModels(claudeLabels, "opus 4.7")).toEqual(matchModels(claudeLabels, "opus-4.7"));
    expect(matchModels(claudeLabels, "opus4.7")).toEqual(matchModels(claudeLabels, "opus-4.7"));
  });

  test("no matches yields an empty list", () => {
    expect(matchModels(claudeLabels, "haiku")).toEqual([]);
  });
});

describe("shortTime", () => {
  test("formats as month day HH:MM, 24h, no year", () => {
    const ts = new Date(2026, 6, 21, 14, 32).getTime();
    expect(shortTime(ts)).toBe("Jul 21 14:32");
  });

  test("pads single-digit hours and minutes", () => {
    const ts = new Date(2026, 0, 5, 9, 3).getTime();
    expect(shortTime(ts)).toBe("Jan 5 09:03");
  });

  test("falls back for a missing timestamp", () => {
    expect(shortTime(0)).toBe("—");
  });
});

describe("sessionLabel", () => {
  test("passes a plain session id through untouched", () => {
    expect(sessionLabel("019f4aec-1234-5678-9abc-def012345678")).toBe("019f4aec-1234-5678-9abc-def012345678");
  });

  test("falls back to the file basename (no ext) when sessionId is a path", () => {
    expect(sessionLabel("/Users/bassim/.claude/projects/foo/019f4aec-1234.jsonl")).toBe("019f4aec-1234");
  });
});

describe("formatRecord", () => {
  const prompt: Prompt = {
    id: "1",
    source: "claude",
    sourceLabel: "Claude Code",
    modelLabel: "Fable 5",
    text: "prompt text...",
    ts: new Date(2026, 6, 21, 14, 32).getTime(),
    project: "prompt-picker",
    sessionId: "019f4aec-1234-5678-9abc-def012345678",
    file: "/tmp/019f4aec-1234-5678-9abc-def012345678.jsonl",
  };

  test("default header shows source, model, project, short time, session id", () => {
    const opts: HeaderOpts = { showModel: true, compact: false, hasSource: false };
    expect(formatRecord(prompt, opts)).toBe(
      "── claude · Fable 5 · prompt-picker · Jul 21 14:32 · 019f4aec-1234-5678-9abc-def012345678\nprompt text...",
    );
  });

  test("model is omitted when -m/--model was given", () => {
    const opts: HeaderOpts = { showModel: false, compact: false, hasSource: false };
    expect(formatRecord(prompt, opts)).toBe("── claude · prompt-picker · Jul 21 14:32 · 019f4aec-1234-5678-9abc-def012345678\nprompt text...");
  });

  test("compact header is just source and session id", () => {
    const opts: HeaderOpts = { showModel: true, compact: true, hasSource: false };
    expect(formatRecord(prompt, opts)).toBe("── claude · 019f4aec-1234-5678-9abc-def012345678\nprompt text...");
  });

  test("compact header drops the source when --source was given", () => {
    const opts: HeaderOpts = { showModel: true, compact: true, hasSource: true };
    expect(formatRecord(prompt, opts)).toBe("── 019f4aec-1234-5678-9abc-def012345678\nprompt text...");
  });

  test("agent prompts are marked in the header", () => {
    const opts: HeaderOpts = { showModel: true, compact: false, hasSource: false };
    expect(formatRecord({ ...prompt, agent: true }, opts)).toBe(
      "── claude · agent · Fable 5 · prompt-picker · Jul 21 14:32 · 019f4aec-1234-5678-9abc-def012345678\nprompt text...",
    );
  });
});
