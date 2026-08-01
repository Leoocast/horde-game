import process from "node:process";
import { verifyGenerationManifest } from "./card-generation-manifest.mjs";

const result = verifyGenerationManifest();

console.log("Hostfall card asset freshness");
for (const [deckId, deck] of Object.entries(result.decks)) {
  console.log(`${deck.ok ? "PASS" : "STALE"} ${deckId}: ${deck.pngCount} PNG(s)`);
  for (const issue of deck.issues.slice(0, 8)) {
    console.log(`  - ${issue.file}: ${issue.message}`);
  }
  if (deck.issues.length > 8) console.log(`  - … ${deck.issues.length - 8} problema(s) más`);
}

const globalIssues = result.issues.filter((issue) => !issue.deckId);
for (const issue of globalIssues) console.log(`STALE global: ${issue.file}: ${issue.message}`);

if (!result.ok) {
  console.error(`La verificación encontró ${result.issues.length} problema(s).`);
  process.exitCode = 1;
} else {
  console.log("Todos los PNG coinciden con sus fuentes locales.");
}
