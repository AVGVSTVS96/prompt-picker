import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App.tsx";
import { buildIndex } from "./sources/index.ts";
import { Favorites } from "./favorites.ts";
import { applyConfigFilters, configuredSources, loadConfig } from "./config.ts";

const config = await loadConfig();
const sources = configuredSources(config);

const [indexResult, favorites] = await Promise.all([
  buildIndex({ sources }),
  Favorites.load(),
]);

const visible = applyConfigFilters(indexResult.prompts, config.filters);

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

root.render(
  <App
    prompts={visible}
    sources={indexResult.sources}
    favorites={favorites}
    now={Date.now()}
    onExit={quit}
  />,
);
