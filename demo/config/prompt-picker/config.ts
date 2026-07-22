// Demo config: fake prompts only, builtins disabled. Used for screenshots.
import type { ConfigApi } from "../../../src/config.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();

interface Fake {
  text: string;
  ago: number;
  project: string;
  model?: string;
}

const claude: Fake[] = [
  { text: "review the uncommitted perf changes, then suggest further cold/warm startup improvements — measure everything before recommending.\n\nspecifically:\n- the cache-skip on unchanged files (does it ever save a stale index?)\n- the single-pass codex parser rewrite (is it equivalent to the old two-pass?)\n- the deferred OpenTUI import trick\n\ndon't make any changes yet, just return your findings and i will approve or deny", ago: 4 * MIN, project: "prompt-picker" },
  { text: "swap the debounce for requestAnimationFrame in the resize handler and delete the lodash dependency", ago: 16 * MIN, project: "design-system" },
  { text: "the S3 presigned URLs expire mid-upload for files over 2GB — switch to multipart with per-part signing", ago: 52 * MIN, project: "atlas-api" },
  { text: "add a --dry-run flag to the reindex CLI that prints what would change without writing the cache", ago: 3 * HOUR + 20 * MIN, project: "prompt-picker" },
  { text: "convert the settings page to server components and measure the bundle delta", ago: 8 * HOUR, project: "checkout-web" },
  { text: "the sqlite WAL file grows to 4GB during bulk import — checkpoint strategy?", ago: 1 * DAY + 1 * HOUR, project: "notes-search" },
  { text: "write property-based tests for the range-merge function, edges: empty, nested, identical, adjacent", ago: 2 * DAY + 5 * HOUR, project: "prompt-picker" },
  { text: "the parser cache never invalidates when I edit a source file, only when mtime changes — should we hash contents instead?", ago: 38 * MIN, project: "prompt-picker" },
  { text: "add search highlighting to both the list rows and the detail pane, merged ranges, case-insensitive", ago: 2 * HOUR, project: "prompt-picker" },
  { text: "write a migration that backfills the workspace_id column on legacy sessions without locking the table", ago: 5 * HOUR, project: "atlas-api" },
  { text: "why does the websocket reconnect loop double its backoff twice per failure? trace it through the retry middleware", ago: 9 * HOUR, project: "atlas-api" },
  { text: "extract the markdown renderer into its own package and keep the plugin API surface identical", ago: 1 * DAY, project: "docs-site" },
  { text: "the flaky e2e test only fails on CI — capture a trace and find the race in the modal focus handler", ago: 2 * DAY, project: "checkout-web" },
  { text: "refactor the theme tokens so dark mode derives from the same palette instead of a forked copy", ago: 3 * DAY, project: "design-system" },
  { text: "profile the JSONL parser on a 1.2GiB corpus and cap concurrent file reads so memory stays flat", ago: 5 * DAY, project: "prompt-picker" },
];

const codex: Fake[] = [
  { text: "implement cursor-based pagination for the audit log endpoint, keyset on (created_at, id)", ago: 12 * MIN, project: "atlas-api", model: "gpt-5.5" },
  { text: "profile the hot path in the rate limiter — the p99 doubled after the redis cluster migration", ago: 45 * MIN, project: "atlas-api", model: "gpt-5.5" },
  { text: "typecheck fails only under bun 1.3 with a phantom circular import — bisect and fix", ago: 2 * HOUR + 10 * MIN, project: "patch-md", model: "gpt-5.3-codex" },
  { text: "vendor the wasm build of the tokenizer and wire it behind the existing interface", ago: 11 * HOUR, project: "notes-search", model: "gpt-5.3-codex" },
  { text: "add exhaustive switch checking to the event reducer, fail the build on unhandled variants", ago: 1 * DAY + 8 * HOUR, project: "checkout-web", model: "gpt-5.5" },
  { text: "fix the off-by-one in the diff hunk header when the last line has no trailing newline", ago: 3 * HOUR, project: "patch-md", model: "gpt-5.5" },
  { text: "port the retry queue from polling to LISTEN/NOTIFY and delete the cron fallback", ago: 7 * HOUR, project: "atlas-api", model: "gpt-5.6" },
  { text: "make the image pipeline emit AVIF with a JPEG fallback and update the srcset helper", ago: 1 * DAY + 3 * HOUR, project: "checkout-web", model: "gpt-5.5" },
  { text: "the tokenizer cache grows unbounded in long sessions — add an LRU with a 512 entry cap and tests", ago: 4 * DAY, project: "patch-md", model: "gpt-5.3-codex" },
];

const pi: Fake[] = [
  { text: "summarize the last three standups and draft tomorrow's agenda with open blockers first", ago: 25 * MIN, project: "team-ops", model: "claude-opus-4-8" },
  { text: "read the RFC on incremental cache invalidation and list the failure modes it hand-waves", ago: 70 * MIN, project: "atlas-api", model: "claude-opus-4-7" },
  { text: "which of our top 20 slow queries would a covering index actually fix? rank by expected win", ago: 4 * HOUR, project: "atlas-api", model: "claude-opus-4-8" },
  { text: "rewrite the onboarding email sequence — shorter, concrete value in the first line of each", ago: 14 * HOUR, project: "team-ops", model: "gpt-5.5" },
  { text: "audit the keyboard navigation across all modals against the WAI-ARIA dialog pattern", ago: 1 * DAY + 10 * HOUR, project: "design-system", model: "claude-sonnet-4-5" },
  { text: "compare the two cache eviction strategies we discussed and recommend one for the read-heavy path", ago: 90 * MIN, project: "atlas-api", model: "claude-opus-4-8" },
  { text: "turn this bug report into a minimal repro: dropdown loses focus when the portal remounts", ago: 6 * HOUR, project: "design-system", model: "gpt-5.5" },
  { text: "draft the release notes for v0.4 — lead with the parser rewrite and the 3x cold start win", ago: 1 * DAY + 6 * HOUR, project: "prompt-picker", model: "claude-opus-4-8" },
  { text: "explain the tradeoffs of storing embeddings in sqlite vs a dedicated vector store for 100k rows", ago: 2 * DAY + 2 * HOUR, project: "notes-search", model: "claude-sonnet-4-5" },
  { text: "review this schema: sessions, prompts, favorites — anything that will hurt us at 10M prompts?", ago: 6 * DAY, project: "prompt-picker", model: "claude-opus-4-8" },
];

export default ({ defineSource, makePrompt }: ConfigApi) => ({
  includeBuiltins: false,
  sources: [
    defineSource({
      id: "claude",
      label: "Claude",
      load: () =>
        claude.map((f, i) =>
          makePrompt({
            source: "claude",
            sourceLabel: "Claude",
            file: `demo-claude-${i}.jsonl`,
            line: i,
            text: f.text,
            ts: now - f.ago,
            cwd: `/Users/demo/code/${f.project}`,
            model: "claude-opus-4-8",
          }),
        ),
    }),
    defineSource({
      id: "codex",
      label: "Codex",
      load: () =>
        codex.map((f, i) =>
          makePrompt({
            source: "codex",
            sourceLabel: "Codex",
            file: `demo-codex-${i}.jsonl`,
            line: i,
            text: f.text,
            ts: now - f.ago,
            cwd: `/Users/demo/code/${f.project}`,
            model: f.model,
          }),
        ),
    }),
    defineSource({
      id: "pi",
      label: "Pi",
      load: () =>
        pi.map((f, i) =>
          makePrompt({
            source: "pi",
            sourceLabel: "Pi",
            file: `demo-pi-${i}.jsonl`,
            line: i,
            text: f.text,
            ts: now - f.ago,
            cwd: `/Users/demo/code/${f.project}`,
            model: f.model,
          }),
        ),
    }),
  ],
});
