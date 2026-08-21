import type { DifficultyMode, GameMode } from "../engine/GameTypes";
import {
  CANON_SEED_COMPATIBILITY,
  CANON_SEED_ENTROPY_ALPHABET,
  CANON_SEED_ENTROPY_LENGTH,
  decodeCanonSeed,
  encodeCanonSeed,
  type CanonSeedCompatibilityRegistry,
} from "./CanonSeed";
import type { ContentCatalog } from "./ContentCatalog";
import { contentCatalog } from "./bootstrap";

type MatchOriginBase = Readonly<{
  rngSeed: string;
  playerDeckKey: string;
  hostDeckKey: string;
  playerDeckId: string;
  hostDeckId: string;
  difficulty: DifficultyMode;
  preparationTurns: number;
  gameMode: GameMode;
  deterministicRevision: string;
  observedContentRevision: string;
}>;

export type CanonMatchOrigin = MatchOriginBase & Readonly<{
  seedKind: "canon";
  canonCode: string;
  canonFormat: "HF1";
}>;

export type OpaqueMatchOrigin = MatchOriginBase & Readonly<{
  seedKind: "opaque";
}>;

export type MatchOrigin = CanonMatchOrigin | OpaqueMatchOrigin;

export type CanonMatchOriginRequest = Readonly<{
  entropy: string;
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
}>;

export type OpaqueMatchOriginRequest = Readonly<{
  rngSeed: string;
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
  preparationTurns: number;
  gameMode: GameMode;
  deterministicRevision?: string;
}>;

export function createCanonMatchOrigin(
  request: CanonMatchOriginRequest,
  catalog: ContentCatalog = contentCatalog,
  compatibility: CanonSeedCompatibilityRegistry = CANON_SEED_COMPATIBILITY,
): CanonMatchOrigin {
  return importCanonMatchOrigin(encodeCanonSeed(request, catalog), catalog, compatibility);
}

/** The only product path that turns an HF1-shaped string into a Canon identity. */
export function importCanonMatchOrigin(
  canonCode: string,
  catalog: ContentCatalog = contentCatalog,
  compatibility: CanonSeedCompatibilityRegistry = CANON_SEED_COMPATIBILITY,
): CanonMatchOrigin {
  const identity = decodeCanonSeed(canonCode, catalog, compatibility);
  const playerDeck = catalog.requireDeck(identity.playerDeckKey, "player");
  const hostDeck = catalog.requireDeck(identity.hostDeckKey, "host");
  return Object.freeze({
    seedKind: "canon",
    canonCode: identity.canonCode,
    canonFormat: identity.format,
    rngSeed: identity.entropy,
    playerDeckKey: identity.playerDeckKey,
    hostDeckKey: identity.hostDeckKey,
    playerDeckId: playerDeck.deck.id,
    hostDeckId: hostDeck.deck.id,
    difficulty: identity.difficulty,
    preparationTurns: identity.preparationTurns,
    gameMode: identity.gameMode,
    deterministicRevision: identity.deterministicRevision,
    observedContentRevision: identity.contentRevision,
  });
}

export function createOpaqueMatchOrigin(
  request: OpaqueMatchOriginRequest,
  catalog: ContentCatalog = contentCatalog,
): OpaqueMatchOrigin {
  const playerDeck = catalog.requireDeck(request.playerDeckKey, "player");
  const hostDeck = catalog.requireDeck(request.hostDeckKey, "host");
  return Object.freeze({
    seedKind: "opaque",
    rngSeed: request.rngSeed,
    playerDeckKey: playerDeck.qualifiedDeckKey,
    hostDeckKey: hostDeck.qualifiedDeckKey,
    playerDeckId: playerDeck.deck.id,
    hostDeckId: hostDeck.deck.id,
    difficulty: request.difficulty,
    preparationTurns: request.preparationTurns,
    gameMode: request.gameMode,
    deterministicRevision: request.deterministicRevision ?? "opaque-runtime-v1",
    observedContentRevision: catalog.revision,
  });
}

export function matchOriginVisualSeed(origin: MatchOrigin): string {
  return origin.seedKind === "canon" ? origin.canonCode : origin.rngSeed;
}

export function matchOriginCanonCode(origin: MatchOrigin): string | undefined {
  return origin.seedKind === "canon" ? origin.canonCode : undefined;
}

export function generateCanonSeedEntropy(randomByte: () => number = secureRandomByte): string {
  let entropy = "";
  // 252 is the largest multiple of 36 below 256, so rejection avoids modulo bias.
  while (entropy.length < CANON_SEED_ENTROPY_LENGTH) {
    const byte = randomByte();
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error("Canon entropy source must return an integer byte.");
    }
    if (byte >= 252) continue;
    entropy += CANON_SEED_ENTROPY_ALPHABET[byte % CANON_SEED_ENTROPY_ALPHABET.length];
  }
  return entropy;
}

function secureRandomByte(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0];
  }
  return Math.floor(Math.random() * 256);
}
