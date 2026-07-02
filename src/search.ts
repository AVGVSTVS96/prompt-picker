import type { Prompt } from "./types.ts";

export interface Scored {
  prompt: Prompt;
  score: number;
  matchAt: number;
}

export function search(prompts: Prompt[], query: string): Scored[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return prompts.map((p) => ({ prompt: p, score: 0, matchAt: -1 }));

  const terms = normalizedQuery.split(/\s+/);
  const results: Scored[] = [];

  for (const p of prompts) {
    const haystack = p.text.toLowerCase();

    const phraseAt = haystack.indexOf(normalizedQuery);
    if (phraseAt !== -1) {
      const onWordBoundary = phraseAt === 0 || /\W/.test(haystack[phraseAt - 1] ?? " ");
      results.push({
        prompt: p,
        score: 1000 - Math.min(phraseAt, 500) + (onWordBoundary ? 200 : 0),
        matchAt: phraseAt,
      });
      continue;
    }

    let everyTermPresent = true;
    let earliestMatch = Infinity;
    let score = 0;
    for (const term of terms) {
      const at = haystack.indexOf(term);
      if (at === -1) {
        everyTermPresent = false;
        break;
      }
      earliestMatch = Math.min(earliestMatch, at);
      score += 100 - Math.min(at, 90);
    }
    if (everyTermPresent) {
      results.push({ prompt: p, score, matchAt: earliestMatch === Infinity ? -1 : earliestMatch });
    }
  }

  results.sort((a, b) => b.score - a.score || b.prompt.ts - a.prompt.ts);
  return results;
}

export type MatchRange = [start: number, end: number];

/**
 * Ranges of `text` matched by `query` (case-insensitive), mirroring search():
 * occurrences of the full phrase when it appears, otherwise occurrences of
 * each term, merged where they overlap.
 */
export function matchRanges(text: string, query: string): MatchRange[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const haystack = text.toLowerCase();

  const pushAll = (term: string, out: MatchRange[]) => {
    for (let at = haystack.indexOf(term); at !== -1; at = haystack.indexOf(term, at + term.length)) {
      out.push([at, at + term.length]);
    }
  };

  const ranges: MatchRange[] = [];
  pushAll(normalizedQuery, ranges);
  if (ranges.length === 0) {
    for (const term of normalizedQuery.split(/\s+/)) pushAll(term, ranges);
  }
  if (ranges.length <= 1) return ranges;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: MatchRange[] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const range = ranges[i];
    const last = merged[merged.length - 1];
    if (range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}
