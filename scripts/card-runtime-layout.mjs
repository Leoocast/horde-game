import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ROOT,
  STUDIO_DECKS,
  loadStudioConfig,
  syncStudioData,
} from "./card-studio-data.mjs";

export const CARD_RUNTIME_LAYOUT_PATH = path.join(
  ROOT,
  "src",
  "data",
  "cardRuntimeLayout.generated.json",
);

const SCHEMA_VERSION = "1.0.0";
const require = createRequire(import.meta.url);

function requireBundledDependency(name) {
  try {
    return require(name);
  } catch {
    return require(path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules",
      name,
    ));
  }
}

function findBrowser() {
  const configuredCandidates = [
    process.env.HOSTFALL_BROWSER_PATH,
    process.env.CHROME_PATH,
  ];
  const windowsCandidates = [
    path.join(process.env.PROGRAMFILES_X86 || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES_X86 || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  const candidates = [
    ...configuredCandidates,
    ...(process.platform === "win32" ? windowsCandidates : []),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function preparePage(page, htmlPath) {
  await page.goto(pathToFileURL(htmlPath).href, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) =>
      image.decode ? image.decode().catch(() => undefined) : Promise.resolve()
    ));
    const container = document.getElementById("cards-container");
    if (!container) throw new Error("No se encontrÃ³ #cards-container en el estudio.");
    container.className = "cards-grid scale-100";
  });
}

function readCurrentLayout() {
  if (!fs.existsSync(CARD_RUNTIME_LAYOUT_PATH)) {
    return { schemaVersion: SCHEMA_VERSION, decks: {} };
  }
  const layout = JSON.parse(fs.readFileSync(CARD_RUNTIME_LAYOUT_PATH, "utf8"));
  if (layout.schemaVersion !== SCHEMA_VERSION || !layout.decks) {
    throw new Error("cardRuntimeLayout.generated.json tiene un schema no soportado.");
  }
  return layout;
}

function orderedLayout(decks) {
  const orderedDecks = {};
  for (const deckId of Object.keys(STUDIO_DECKS)) {
    if (decks[deckId]) orderedDecks[deckId] = decks[deckId];
  }
  return { schemaVersion: SCHEMA_VERSION, decks: orderedDecks };
}

export async function measureDeckRuntimeLayout(page, deckId) {
  const { paths } = loadStudioConfig(deckId);
  await preparePage(page, paths.index);
  const cards = await page.locator(".tcg-card").evaluateAll((elements) => {
    const round = (value) => Math.round(value * 1_000) / 1_000;
    return Object.fromEntries(elements.flatMap((card) => {
      if (!(card instanceof HTMLElement) || !card.classList.contains("tcg-card--full-art")) return [];
      const cardId = card.dataset.cardId;
      if (!cardId) return [];
      const cardBounds = card.getBoundingClientRect();
      const stats = card.querySelector(".tcg-stats-badge");
      const presentation = { fullArt: true };
      if (stats instanceof HTMLElement) {
        const statsBounds = stats.getBoundingClientRect();
        presentation.statsFrame = {
          right: round(cardBounds.right - statsBounds.right),
          bottom: round(cardBounds.bottom - statsBounds.bottom),
          width: round(statsBounds.width),
          height: round(statsBounds.height),
        };
      }
      return [[cardId, presentation]];
    }));
  });
  return { cards };
}

export async function measureRuntimeLayouts(deckIds) {
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new Error(
      "No se encontrÃ³ Google Chrome ni Microsoft Edge. Define HOSTFALL_BROWSER_PATH para medir layouts.",
    );
  }
  const { chromium } = requireBundledDependency("playwright");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
    const decks = {};
    for (const deckId of deckIds) {
      syncStudioData({ deckIds: [deckId] });
      decks[deckId] = await measureDeckRuntimeLayout(page, deckId);
    }
    return decks;
  } finally {
    await browser.close();
  }
}

export function writeRuntimeLayouts(measuredDecks) {
  const current = readCurrentLayout();
  const next = orderedLayout({ ...current.decks, ...measuredDecks });
  fs.writeFileSync(CARD_RUNTIME_LAYOUT_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

async function main() {
  const requestedDecks = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const deckIds = requestedDecks.length > 0
    ? requestedDecks
    : Object.entries(STUDIO_DECKS)
        .filter(([, definition]) => !definition.previewOnly)
        .map(([deckId]) => deckId);
  for (const deckId of deckIds) {
    if (!STUDIO_DECKS[deckId]) throw new Error(`Estudio desconocido "${deckId}".`);
  }
  const measured = await measureRuntimeLayouts(deckIds);
  const layout = writeRuntimeLayouts(measured);
  for (const deckId of deckIds) {
    console.log(`${deckId}: ${Object.keys(layout.decks[deckId].cards).length} layouts full-art medidos.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
