export {};

const dataPromise = (async () => {
  const [{ buildIndex }, { Favorites }, configMod] = await Promise.all([
    import("./sources/index.ts"),
    import("./favorites.ts"),
    import("./config.ts"),
  ]);

  const config = await configMod.loadConfig();
  const sources = configMod.configuredSources(config);

  const [indexResult, favorites] = await Promise.all([
    buildIndex({ sources }),
    Favorites.load(),
  ]);

  return {
    indexResult,
    favorites,
    visible: configMod.applyConfigFilters(indexResult.prompts, config.filters),
  };
})();
// Rejections are surfaced at the Promise.all below; without this handler a
// failure during the OpenTUI imports would die as an unhandled rejection.
dataPromise.catch(() => {});

const { createCliRenderer } = await import("@opentui/core");
const { createRoot } = await import("@opentui/react");
const [{ createElement }, { App }, data] = await Promise.all([
  import("react"),
  import("./ui/App.tsx"),
  dataPromise,
]);

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
  createElement(App, {
    prompts: data.visible,
    sources: data.indexResult.sources,
    favorites: data.favorites,
    now: Date.now(),
    onExit: quit,
  }),
);

if (process.env.PP_STARTUP) {
  const ms = performance.now().toFixed(0);
  quit();
  process.stderr.write(`[startup] first render at ${ms}ms\n`);
}
