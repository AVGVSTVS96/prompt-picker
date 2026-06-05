export const tokyoNight = {
  bg: "#1a1b26",
  bgDark: "#16161e",
  bgHighlight: "#292e42",
  bgSelected: "#2f3549",
  fg: "#c0caf5",
  fgDark: "#a9b1d6",
  fgGutter: "#3b4261",
  comment: "#565f89",
  blue: "#7aa2f7",
  cyan: "#7dcfff",
  green: "#9ece6a",
  magenta: "#bb9af7",
  red: "#f7768e",
  orange: "#ff9e64",
  yellow: "#e0af68",
  teal: "#1abc9c",
  border: "#3b4261",
} as const;

export const agentColor: Record<string, string> = {
  claude: tokyoNight.orange,
  codex: tokyoNight.green,
  pi: tokyoNight.magenta,
};
