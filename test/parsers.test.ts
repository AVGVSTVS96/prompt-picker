import { describe, expect, test } from "bun:test";
import { parseClaude } from "../src/sources/claude.ts";
import { parseCodex } from "../src/sources/codex.ts";
import { parsePi } from "../src/sources/pi.ts";

const jsonl = (...lines: unknown[]) => lines.map((l) => JSON.stringify(l)).join("\n");

describe("parseClaude", () => {
  test("extracts typed prompts and attaches the nearest reply model", () => {
    const raw = jsonl(
      {
        type: "user",
        message: { content: "real prompt" },
        timestamp: "2023-11-14T22:13:20.000Z",
        cwd: "/home/me/proj",
        sessionId: "s1",
      },
      { type: "assistant", message: { model: "claude-opus-4-8" } },
    );
    const out = parseClaude("/c/file.jsonl", raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      agent: "claude",
      text: "real prompt",
      modelKey: "opus-4-8",
      modelLabel: "Opus 4.8",
      project: "proj",
      sessionId: "s1",
      ts: 1_700_000_000_000,
    });
  });

  test("drops injected, meta, tool-result and blank user turns", () => {
    const raw = jsonl(
      { type: "user", message: { content: "<system-reminder>noise</system-reminder>" } },
      { type: "user", isMeta: true, message: { content: "meta noise" } },
      { type: "user", message: { content: [{ type: "tool_result", text: "result" }] } },
      { type: "user", message: { content: "   " } },
      { type: "user", message: { content: "kept" } },
    );
    const out = parseClaude("/c/file.jsonl", raw);
    expect(out.map((p) => p.text)).toEqual(["kept"]);
  });

  test("labels prompts 'Claude' when no model is known", () => {
    const raw = jsonl({ type: "user", message: { content: "hi" } });
    expect(parseClaude("/c/file.jsonl", raw)[0].modelLabel).toBe("Claude");
  });
});

describe("parseCodex", () => {
  test("prefers event_msg user messages with the turn-context model", () => {
    const raw = jsonl(
      { type: "session_meta", payload: { cwd: "/w/app", id: "sess", model_provider: "openai" } },
      { type: "event_msg", payload: { type: "user_message", message: "codex prompt" } },
      { type: "turn_context", payload: { model: "gpt-5.5" } },
    );
    const out = parseCodex("/x/file.jsonl", raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      agent: "codex",
      text: "codex prompt",
      modelKey: "gpt-5-5",
      project: "app",
      sessionId: "sess",
    });
  });

  test("falls back to response_item users when no event users exist", () => {
    const raw = jsonl(
      { type: "session_meta", payload: { id: "sess" } },
      {
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "via item" }] },
      },
    );
    const out = parseCodex("/x/file.jsonl", raw);
    expect(out.map((p) => p.text)).toEqual(["via item"]);
  });

  test("filters injected prefixes", () => {
    const raw = jsonl(
      { type: "event_msg", payload: { type: "user_message", message: "<environment_context>x" } },
      { type: "event_msg", payload: { type: "user_message", message: "kept" } },
    );
    expect(parseCodex("/x/file.jsonl", raw).map((p) => p.text)).toEqual(["kept"]);
  });
});

describe("parsePi", () => {
  test("extracts prompts and attaches the nearest assistant model", () => {
    const raw = jsonl(
      { type: "session", cwd: "/w/pi-proj", id: "ps" },
      { type: "message", message: { role: "user", content: "pi prompt" }, timestamp: 1_700_000_000 },
      { type: "message", message: { role: "assistant", model: "opus-4-8", provider: "anthropic" } },
    );
    const out = parsePi("/p/file.jsonl", raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      agent: "pi",
      text: "pi prompt",
      modelKey: "opus-4-8",
      project: "pi-proj",
      sessionId: "ps",
      ts: 1_700_000_000_000,
    });
  });

  test("filters compaction and skill injection noise", () => {
    const raw = jsonl(
      { type: "session", id: "ps" },
      { type: "message", message: { role: "user", content: "<skill name=\"x\">block</skill>" } },
      {
        type: "message",
        message: {
          role: "user",
          content: "The conversation history before this point was compacted",
        },
      },
      { type: "message", message: { role: "user", content: "kept" } },
    );
    expect(parsePi("/p/file.jsonl", raw).map((p) => p.text)).toEqual(["kept"]);
  });
});
