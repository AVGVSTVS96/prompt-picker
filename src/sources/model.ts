const BRAND_WORDS: Record<string, string> = { gpt: "GPT", deepseek: "DeepSeek" };

function titleWord(word: string): string {
  return BRAND_WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1);
}

export function labelModel(modelId?: string, provider?: string): string {
  if (!modelId) return provider ? titleWord(provider) : "Unknown";

  const withoutProvider = modelId.includes("/") ? modelId.slice(modelId.lastIndexOf("/") + 1) : modelId;
  const withoutClaudePrefix = withoutProvider.replace(/^claude-/i, "");
  const name = withoutClaudePrefix.replace(/-\d{8}$/, "");
  const low = name.toLowerCase();

  const claudeFamily = low.match(/^(opus|sonnet|haiku|fable)-?(\d+)(?:[.\-](\d+))?/);
  if (claudeFamily) {
    const [, family, major, minor] = claudeFamily;
    return `${titleWord(family)} ${minor ? `${major}.${minor}` : major}`;
  }

  const words = name.split("-").map(titleWord).join(" ");
  // GPT keeps its version number hyphenated: "GPT-5.5", not "GPT 5.5".
  return low.startsWith("gpt") ? words.replace(/^GPT (\d)/, "GPT-$1") : words;
}
