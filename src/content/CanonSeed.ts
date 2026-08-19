import type { DifficultyMode, Side } from "../engine/GameTypes";
import type { ContentCatalog } from "./ContentCatalog";
import { contentCatalog } from "./bootstrap";
import { qualifiedDeckKey } from "./identity";

export const CANON_SEED_FORMAT = "HF1" as const;
export const CANON_SEED_RULESET_VERSION = 1 as const;
export const CANON_SEED_ENTROPY_LENGTH = 5;
export const CANON_SEED_ENTROPY_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const HF1_PACK_ID = "hostfall.core";

type CanonDeckRegistration = Readonly<{
  code: string;
  side: Side;
  qualifiedDeckKey: string;
}>;

export const CANON_SEED_DECKS = Object.freeze([
  Object.freeze({
    code: "ELA",
    side: "player",
    qualifiedDeckKey: qualifiedDeckKey(HF1_PACK_ID, "pact_of_elarion"),
  }),
  Object.freeze({
    code: "CEC",
    side: "player",
    qualifiedDeckKey: qualifiedDeckKey(HF1_PACK_ID, "court_of_the_crimson_eclipse"),
  }),
  Object.freeze({
    code: "GRV",
    side: "host",
    qualifiedDeckKey: qualifiedDeckKey(HF1_PACK_ID, "uprising_of_the_graveless"),
  }),
  Object.freeze({
    code: "VRK",
    side: "host",
    qualifiedDeckKey: qualifiedDeckKey(HF1_PACK_ID, "legion_of_varka"),
  }),
] as const satisfies readonly CanonDeckRegistration[]);

export type CanonSeedDeckCode = (typeof CANON_SEED_DECKS)[number]["code"];
export type CanonSeedDifficultyCode = "1" | "2" | "3";

export type SeedFutureIdentity = Readonly<{
  canonCode: string;
  format: typeof CANON_SEED_FORMAT;
  entropy: string;
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
  /** Derived from difficulty; it is never serialized as an independent Canon Seed choice. */
  preparationTurns: number;
  gameMode: "standard";
  contentRevision: string;
  rulesetVersion: typeof CANON_SEED_RULESET_VERSION;
}>;

export type CanonSeedEncodeRequest = Readonly<{
  entropy: string;
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
}>;

const DIFFICULTY_BY_CODE: Readonly<Record<CanonSeedDifficultyCode, Readonly<{
  difficulty: DifficultyMode;
  preparationTurns: number;
}>>> = Object.freeze({
  "1": Object.freeze({ difficulty: "easy", preparationTurns: 4 }),
  "2": Object.freeze({ difficulty: "normal", preparationTurns: 3 }),
  "3": Object.freeze({ difficulty: "hard", preparationTurns: 2 }),
});

const CODE_BY_DIFFICULTY: Readonly<Record<DifficultyMode, CanonSeedDifficultyCode>> = Object.freeze({
  easy: "1",
  normal: "2",
  hard: "3",
});

const CANON_SEED_PATTERN = /^HF1-([A-Z0-9]{3})-([A-Z0-9]{3})-([A-Z0-9]{2})([123])-([A-Z0-9]{3})$/u;
const CANON_ENTROPY_PATTERN = /^[A-Z0-9]{5}$/u;

export function encodeCanonSeed(
  request: CanonSeedEncodeRequest,
  catalog: ContentCatalog = contentCatalog,
): string {
  const entropy = normalizeCanonSeedEntropy(request.entropy);
  const playerRecord = catalog.requireDeck(request.playerDeckKey, "player");
  const hostRecord = catalog.requireDeck(request.hostDeckKey, "host");
  const playerCode = requireDeckCode(playerRecord.qualifiedDeckKey, "player");
  const hostCode = requireDeckCode(hostRecord.qualifiedDeckKey, "host");
  const difficultyCode = CODE_BY_DIFFICULTY[request.difficulty];
  return `${CANON_SEED_FORMAT}-${playerCode}-${hostCode}-${entropy.slice(0, 2)}${difficultyCode}-${entropy.slice(2)}`;
}

export function decodeCanonSeed(
  input: string,
  catalog: ContentCatalog = contentCatalog,
): SeedFutureIdentity {
  const normalized = input.toUpperCase();
  const match = CANON_SEED_PATTERN.exec(normalized);
  if (!match) {
    throw new Error("Canon Seed must match HF1-PPP-HHH-XXD-XXX using only A-Z, 0-9 and difficulty 1-3.");
  }

  const playerRegistration = requireDeckRegistration(match[1], "player");
  const hostRegistration = requireDeckRegistration(match[2], "host");
  const difficulty = DIFFICULTY_BY_CODE[match[4] as CanonSeedDifficultyCode];
  const entropy = `${match[3]}${match[5]}`;
  const playerRecord = catalog.requireDeck(playerRegistration.qualifiedDeckKey, "player");
  const hostRecord = catalog.requireDeck(hostRegistration.qualifiedDeckKey, "host");

  return Object.freeze({
    canonCode: normalized,
    format: CANON_SEED_FORMAT,
    entropy,
    playerDeckKey: playerRecord.qualifiedDeckKey,
    hostDeckKey: hostRecord.qualifiedDeckKey,
    difficulty: difficulty.difficulty,
    preparationTurns: difficulty.preparationTurns,
    gameMode: "standard",
    contentRevision: catalog.revision,
    rulesetVersion: CANON_SEED_RULESET_VERSION,
  });
}

export function isCanonSeed(input: string, catalog: ContentCatalog = contentCatalog): boolean {
  try {
    decodeCanonSeed(input, catalog);
    return true;
  } catch {
    return false;
  }
}

export function normalizeCanonSeedEntropy(input: string): string {
  const normalized = input.toUpperCase();
  if (!CANON_ENTROPY_PATTERN.test(normalized)) {
    throw new Error("Canon Seed entropy must contain exactly five A-Z or 0-9 characters.");
  }
  return normalized;
}

export function canonSeedPreparationTurns(difficulty: DifficultyMode): number {
  return DIFFICULTY_BY_CODE[CODE_BY_DIFFICULTY[difficulty]].preparationTurns;
}

function requireDeckRegistration(code: string, side: Side): (typeof CANON_SEED_DECKS)[number] {
  const registration = CANON_SEED_DECKS.find((entry) => entry.code === code && entry.side === side);
  if (!registration) throw new Error(`Canon Seed ${side} deck code "${code}" is not registered for ${CANON_SEED_FORMAT}.`);
  return registration;
}

function requireDeckCode(qualifiedKey: string, side: Side): CanonSeedDeckCode {
  const registration = CANON_SEED_DECKS.find(
    (entry) => entry.qualifiedDeckKey === qualifiedKey && entry.side === side,
  );
  if (!registration) {
    throw new Error(`Deck "${qualifiedKey}" has no ${CANON_SEED_FORMAT} ${side} code.`);
  }
  return registration.code;
}
