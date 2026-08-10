// Deck lint: validates every registered deck JSON against the engine's real vocabulary and
// prints a per-deck implementation report. Exits 1 when a card declares something the engine
// would silently ignore. Run with:
//   node scripts/lint-decks.mjs
import { createServer } from "vite";
import path from "node:path";

const server = await createServer({
  appType: "custom",
  configFile: path.resolve(process.cwd(), "vite.config.ts"),
  logLevel: "silent",
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  const { lintDecks } = await server.ssrLoadModule("/src/data/deckLint.ts");
  const { errors, reports } = lintDecks();

  for (const report of reports) {
    const counts = { vanilla: 0, ready: 0, partial: 0 };
    for (const row of report.cards) counts[row.status] += 1;
    console.log(`\n${report.label} (${report.deckId}) — ready ${counts.ready} · vanilla ${counts.vanilla} · partial ${counts.partial}`);
    for (const row of report.cards) {
      if (row.status === "partial") console.log(`  [WIP]    ${row.cardId} — pending: ${row.pending.join(", ")}`);
      else if (row.intentional.length > 0) console.log(`  [ready]  ${row.cardId} (ignored/custom: ${row.intentional.join(", ")})`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n${errors.length} lint error(s):`);
    for (const issue of errors) console.log(`  ${issue.deckId} / ${issue.cardId} / ${issue.abilityId}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log("\nDeck lint: OK");
  }
} finally {
  await server.close();
}
