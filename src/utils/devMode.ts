/** Development-only tooling gate (the Playground screen).
 *
 * This is NOT the `developer` seed: that one rigs the contents of a normal match (opening hand,
 * starting lands, forced Host top-decks). This flag decides whether developer *tools* exist at all.
 *
 * `import.meta.env.DEV` is false in `vite build`, so anything behind this flag can be lazily
 * imported and dropped from the production bundle. The `?playground` query is an escape hatch for
 * running the tools against a preview build.
 */
export const IS_DEV: boolean =
  import.meta.env.DEV ||
  (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("playground"));
