import type { ModelKey } from "../types.ts";

export function classifyModel(
  modelId: string | undefined,
  provider?: string,
): { modelKey: ModelKey; modelLabel: string } {
  const id = (modelId ?? "").toLowerCase();

  if (/opus-?4[.\-]?8/.test(id)) return { modelKey: "opus-4-8", modelLabel: "Opus 4.8" };
  if (/opus-?4[.\-]?7/.test(id)) return { modelKey: "opus-4-7", modelLabel: "Opus 4.7" };
  if (/gpt-?5[.\-]?5/.test(id)) return { modelKey: "gpt-5-5", modelLabel: "GPT-5.5" };

  if (!id) return { modelKey: "other", modelLabel: provider ? prettyProvider(provider) : "Unknown" };
  return { modelKey: "other", modelLabel: prettyModel(modelId!) };
}

function prettyProvider(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function prettyModel(id: string): string {
  const withoutProviderPrefix = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const low = withoutProviderPrefix.toLowerCase();

  const claudeFamily = low.match(/(opus|sonnet|haiku)-?(\d)[.\-]?(\d)/);
  if (claudeFamily) {
    const family = claudeFamily[1][0].toUpperCase() + claudeFamily[1].slice(1);
    return `${family} ${claudeFamily[2]}.${claudeFamily[3]}`;
  }
  if (low.startsWith("gpt") || low.includes("codex")) {
    return withoutProviderPrefix
      .split("-")
      .map((seg) => (/^gpt/i.test(seg) ? seg.toUpperCase() : seg.charAt(0).toUpperCase() + seg.slice(1)))
      .join(" ")
      .replace(/^GPT (\d)/, "GPT-$1");
  }
  return withoutProviderPrefix;
}
