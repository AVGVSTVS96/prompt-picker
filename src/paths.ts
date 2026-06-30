import { homedir } from "node:os";
import { join } from "node:path";

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "prompt-picker");
}
