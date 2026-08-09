/** Development-only tooling gate (the Playground screen).
 *
 * This is NOT the `developer` seed: that one rigs the contents of a normal match (opening hand,
 * starting lands, forced Host top-decks). This flag decides whether developer *tools* exist at all.
 *
 * `import.meta.env.DEV` is replaced at compile time. Release builds cannot re-enable these tools
 * through a URL, stored preference or runtime flag.
 */
export const IS_DEV: boolean = import.meta.env.DEV;
