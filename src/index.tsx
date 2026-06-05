import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App.tsx";
import { buildIndex } from "./sources/index.ts";
import { Favorites } from "./favorites.ts";
import { loadConfigFilters, applyConfigFilters } from "./config.ts";

const [{ prompts }, favorites, configFilters] = await Promise.all([
  buildIndex(),
  Favorites.load(),
  loadConfigFilters(),
]);

const visible = applyConfigFilters(prompts, configFilters);

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: false,
  targetFps: 30,
});

const root = createRoot(renderer);

function quit() {
  root.unmount();
  renderer.destroy();
}

root.render(<App prompts={visible} favorites={favorites} now={Date.now()} onExit={quit} />);
