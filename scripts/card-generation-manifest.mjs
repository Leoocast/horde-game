import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  STUDIO_DECKS,
  buildStudioCards,
  loadStudioConfig,
  studioSourceFiles,
  syncStudioData,
} from "./card-studio-data.mjs";

export const MANIFEST_PATH = path.join(ROOT, "dev", "tools", "Decks", "generation-manifest.json");
export const EXPORTED_DECKS = Object.freeze(["pact_of_elarion", "uprising_of_the_graveless", "legion_of_varka", "court_of_the_crimson_eclipse"]);
const MANIFEST_SCHEMA_VERSION = "1.0.0";

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function fileHash(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function pngSize(filePath) {
  const png = fs.readFileSync(filePath);
  if (png.length < 24 || png.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error(`${relative(filePath)} no es un PNG válido.`);
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function deckOutputDirectory(deckId) {
  const definition = STUDIO_DECKS[deckId];
  if (!definition || definition.previewOnly) {
    throw new Error(`${deckId} no es un estudio exportable.`);
  }
  return path.join(ROOT, definition.publicDirectory);
}

function sourceRecords(deckId) {
  return studioSourceFiles(deckId).map((filePath) => ({
    path: relative(filePath),
    sha256: fileHash(filePath),
  }));
}

function combinedInputHash(sources) {
  const fingerprint = sources
    .map((source) => `${source.path}\0${source.sha256}`)
    .join("\n");
  return sha256(fingerprint);
}

function expectedCardOutputs(deckId) {
  const outputDirectory = deckOutputDirectory(deckId);
  return buildStudioCards(deckId).map((card) => ({
    id: card.id,
    filePath: path.join(outputDirectory, `${card.id}.png`),
  }));
}

export function recursiveArtSources(deckId) {
  const { paths } = loadStudioConfig(deckId);
  const outputDirectory = path.resolve(deckOutputDirectory(deckId));
  return buildStudioCards(deckId)
    .map((card) => ({
      id: card.id,
      filePath: path.resolve(paths.directory, card.art_crop),
    }))
    .filter(({ filePath }) => path.dirname(filePath) === outputDirectory)
    .map(({ id, filePath }) => `${id}: ${relative(filePath)}`);
}

export function assertIndependentArtSources(deckId) {
  const recursive = recursiveArtSources(deckId);
  if (recursive.length > 0) {
    throw new Error(
      `${deckId} usa PNGs finales como arte fuente. Muévelos a una carpeta art/ antes de exportar:\n`
        + recursive.map((entry) => `- ${entry}`).join("\n"),
    );
  }
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { schemaVersion: MANIFEST_SCHEMA_VERSION, decks: {} };
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION || !manifest.decks) {
    throw new Error("dev/tools/Decks/generation-manifest.json tiene un schema no soportado.");
  }
  return manifest;
}

export function recordDeckGeneration(deckId) {
  assertIndependentArtSources(deckId);
  const sources = sourceRecords(deckId);
  const cards = expectedCardOutputs(deckId).map(({ id, filePath }) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`${deckId}: falta el PNG exportado ${relative(filePath)}.`);
    }
    const size = pngSize(filePath);
    if (size.width !== 976 || size.height !== 1360) {
      throw new Error(`${relative(filePath)} mide ${size.width}x${size.height}; se esperaba 976x1360.`);
    }
    return {
      id,
      path: relative(filePath),
      sha256: fileHash(filePath),
      width: size.width,
      height: size.height,
    };
  });
  const manifest = readManifest();
  manifest.decks[deckId] = {
    inputHash: combinedInputHash(sources),
    sources,
    cards,
  };
  const orderedDecks = {};
  for (const id of EXPORTED_DECKS) {
    if (manifest.decks[id]) orderedDecks[id] = manifest.decks[id];
  }
  fs.writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify({ schemaVersion: MANIFEST_SCHEMA_VERSION, decks: orderedDecks }, null, 2)}\n`,
  );
  return manifest.decks[deckId];
}

function topLevelPngs(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".png")
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

export function verifyGenerationManifest() {
  const issues = [];
  const deckResults = {};
  const staleGeneratedData = syncStudioData({ check: true });
  for (const file of staleGeneratedData) {
    issues.push({ deckId: null, code: "stale-studio-data", file, message: `${file} no coincide con sus fuentes.` });
  }

  let manifest;
  try {
    manifest = readManifest();
  } catch (error) {
    manifest = { schemaVersion: null, decks: {} };
    issues.push({ deckId: null, code: "invalid-manifest", file: relative(MANIFEST_PATH), message: error.message });
  }

  for (const deckId of EXPORTED_DECKS) {
    const deckIssues = [];
    const outputDirectory = deckOutputDirectory(deckId);
    const actualPngs = topLevelPngs(outputDirectory);
    const expected = expectedCardOutputs(deckId);
    const expectedPaths = new Set(expected.map(({ filePath }) => path.resolve(filePath)));
    const untrackedOutputs = actualPngs.filter((filePath) => !expectedPaths.has(path.resolve(filePath)));
    for (const filePath of untrackedOutputs) {
      deckIssues.push({
        deckId,
        code: "unexpected-png",
        file: relative(filePath),
        message: "El PNG no corresponde a ninguna carta vigente del estudio.",
      });
    }

    const recursive = recursiveArtSources(deckId);
    for (const entry of recursive) {
      deckIssues.push({
        deckId,
        code: "recursive-art-source",
        file: entry.split(": ")[1],
        message: "El PNG final se usa como arte de su propio generador.",
      });
    }

    const recorded = manifest.decks?.[deckId];
    if (!recorded) {
      for (const filePath of actualPngs) {
        deckIssues.push({
          deckId,
          code: "missing-deck-manifest",
          file: relative(filePath),
          message: "No existe una huella de generación para este PNG.",
        });
      }
    } else {
      const sources = sourceRecords(deckId);
      const currentInputHash = combinedInputHash(sources);
      if (recorded.inputHash !== currentInputHash) {
        deckIssues.push({
          deckId,
          code: "stale-input-hash",
          file: relative(MANIFEST_PATH),
          message: "Las entradas del estudio cambiaron después de exportar sus PNG.",
        });
      }

      const recordedById = new Map((recorded.cards ?? []).map((card) => [card.id, card]));
      for (const { id, filePath } of expected) {
        const cardRecord = recordedById.get(id);
        if (!fs.existsSync(filePath)) {
          deckIssues.push({ deckId, code: "missing-png", file: relative(filePath), message: "Falta el PNG final." });
          continue;
        }
        if (!cardRecord) {
          deckIssues.push({ deckId, code: "missing-card-record", file: relative(filePath), message: "Falta la huella del PNG." });
          continue;
        }
        const size = pngSize(filePath);
        if (
          cardRecord.path !== relative(filePath)
          || cardRecord.sha256 !== fileHash(filePath)
          || cardRecord.width !== size.width
          || cardRecord.height !== size.height
        ) {
          deckIssues.push({ deckId, code: "png-hash-mismatch", file: relative(filePath), message: "El PNG no coincide con su huella registrada." });
        }
      }
    }

    issues.push(...deckIssues);
    const unverifiedPngs = actualPngs.filter((filePath) => {
      const relativePath = relative(filePath);
      return deckIssues.some((issue) => issue.file === relativePath || issue.file === relative(MANIFEST_PATH));
    });
    deckResults[deckId] = {
      ok: deckIssues.length === 0,
      pngCount: actualPngs.length,
      unverifiedPngs: unverifiedPngs.map(relative),
      issues: deckIssues,
    };
  }

  return {
    ok: issues.length === 0,
    issues,
    decks: deckResults,
    unverifiedPngs: Object.values(deckResults).flatMap((deck) => deck.unverifiedPngs),
  };
}
