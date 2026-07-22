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
      source: "claude",
      text: "real prompt",
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
      { type: "user", message: { content: "[Request interrupted by user]" } },
      { type: "user", message: { content: "[Request interrupted by user for tool use]" } },
      { type: "user", message: { content: "This session is being continued from a previous conversation that ran out of context…" } },
      { type: "user", message: { content: "kept" } },
    );
    const out = parseClaude("/c/file.jsonl", raw);
    expect(out.map((p) => p.text)).toEqual(["kept"]);
  });

  test("labels prompts 'Claude' when no model is known", () => {
    const raw = jsonl({ type: "user", message: { content: "hi" } });
    expect(parseClaude("/c/file.jsonl", raw)[0].modelLabel).toBe("Claude");
  });

  test("drops sidechain records: subagent prompts and their models", () => {
    const raw = jsonl(
      { type: "user", isSidechain: true, message: { content: "prompt Claude wrote for a subagent" } },
      { type: "user", message: { content: "kept" } },
      { type: "assistant", isSidechain: true, message: { model: "claude-haiku-4-5" } },
      { type: "assistant", message: { model: "claude-fable-5" } },
    );
    const out = parseClaude("/c/file.jsonl", raw);
    expect(out.map((p) => p.text)).toEqual(["kept"]);
    expect(out[0].modelLabel).toBe("Fable 5");
  });

  test("tags sdk-driven prompts (entrypoint sdk-cli) as agent", () => {
    const raw = jsonl(
      { type: "user", entrypoint: "sdk-cli", message: { content: "app-generated prompt" } },
      { type: "user", entrypoint: "cli", message: { content: "typed prompt" } },
    );
    const out = parseClaude("/c/file.jsonl", raw);
    expect(out.map((p) => [p.text, p.agent])).toEqual([
      ["typed prompt", undefined],
      ["app-generated prompt", true],
    ]);
  });

  test("tags prompts with no reply after them as unsent", () => {
    const raw = jsonl(
      { type: "user", message: { content: "answered" } },
      { type: "assistant", message: { model: "claude-fable-5" } },
      { type: "user", message: { content: "never answered" } },
      { type: "assistant", message: { model: "<synthetic>" } },
    );
    const out = parseClaude("/c/file.jsonl", raw);
    expect(out.map((p) => [p.text, p.unsent])).toEqual([
      ["never answered", true],
      ["answered", undefined],
    ]);
    expect(out[0].modelLabel).toBe("Fable 5");
  });

  test("parses subagents/ transcript files fully, tagging every prompt as agent", () => {
    const raw = jsonl(
      { type: "user", isSidechain: true, message: { content: "subagent task" } },
      { type: "assistant", isSidechain: true, message: { model: "claude-haiku-4-5" } },
    );
    const out = parseClaude("/c/proj/sess/subagents/agent-1.jsonl", raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "subagent task", agent: true, modelLabel: "Haiku 4.5" });
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
      source: "codex",
      text: "codex prompt",
      modelLabel: "GPT-5.5",
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

  test("tags prompts with no agent reply after them as unsent", () => {
    const raw = jsonl(
      { type: "session_meta", payload: { id: "sess" } },
      { type: "event_msg", payload: { type: "user_message", message: "answered" } },
      { type: "event_msg", payload: { type: "agent_message", message: "reply" } },
      { type: "event_msg", payload: { type: "user_message", message: "never answered" } },
    );
    const out = parseCodex("/x/file.jsonl", raw);
    expect(out.map((p) => [p.text, p.unsent])).toEqual([
      ["never answered", true],
      ["answered", undefined],
    ]);
  });

  test("tags subagent threads as agent (source and thread_source markers)", () => {
    const bySource = jsonl(
      { type: "session_meta", payload: { id: "sub", source: { subagent: { parent_thread_id: "t1" } } } },
      { type: "event_msg", payload: { type: "user_message", message: "parent-written prompt" } },
    );
    const byThreadSource = jsonl(
      { type: "session_meta", payload: { id: "sub", thread_source: { subagent: "review" } } },
      { type: "event_msg", payload: { type: "user_message", message: "review prompt" } },
    );
    expect(parseCodex("/x/a.jsonl", bySource).map((p) => p.agent)).toEqual([true]);
    expect(parseCodex("/x/b.jsonl", byThreadSource).map((p) => p.agent)).toEqual([true]);
    const userThread = jsonl(
      { type: "session_meta", payload: { id: "s", source: "cli" } },
      { type: "event_msg", payload: { type: "user_message", message: "typed" } },
    );
    expect(parseCodex("/x/c.jsonl", userThread)[0].agent).toBeUndefined();
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
      source: "pi",
      text: "pi prompt",
      modelLabel: "Opus 4.8",
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
