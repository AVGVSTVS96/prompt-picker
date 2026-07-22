import React from "react";
import { tokyoNight as T } from "../theme.ts";

export function SearchInput({ query, placeholder }: { query: string; placeholder: string }) {
  return (
    <box style={{ flexDirection: "row", flexGrow: 1 }}>
      <text fg={T.cyan}>{"⌕  "}</text>
      <text fg={query ? T.fg : T.comment}>{query || placeholder}</text>
    </box>
  );
}
