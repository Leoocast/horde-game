import {
  CANON_SEED_COMPATIBILITY,
  CANON_SEED_RULESET_VERSION,
  type CanonSeedCompatibilityRegistry,
} from "../content/CanonSeed";
import type { ContentCatalog } from "../content/ContentCatalog";
import {
  createOpaqueMatchOrigin,
  importCanonMatchOrigin,
  OPAQUE_MATCH_DETERMINISTIC_REVISION,
  OPAQUE_MATCH_RULESET_VERSION,
  type MatchOrigin,
} from "../content/MatchOrigin";
import { contentCatalog } from "../content/bootstrap";
import type { FutureIdentityV1 } from "./historyTypes";

export type FutureCompatibilityResult =
  | Readonly<{ compatible: true }>
  | Readonly<{ compatible: false; reason: "format" | "ruleset" | "content" }>;

export type FutureResolutionResult =
  | Readonly<{ ok: true; origin: MatchOrigin }>
  | Readonly<{
      ok: false;
      reason: "deterministic-incompatible" | "deck-unavailable" | "identity-mismatch";
    }>;

export function futureIdentityFromMatchOrigin(origin: MatchOrigin): FutureIdentityV1 {
  if (origin.gameMode !== "standard") {
    throw new Error("History only accepts standard match origins.");
  }
  if (origin.seedKind === "canon") {
    return Object.freeze({
      seedKind: "canon",
      format: origin.canonFormat,
      canonCode: origin.canonCode.toUpperCase(),
      rngSeed: origin.rngSeed,
      playerDeckKey: origin.playerDeckKey,
      hostDeckKey: origin.hostDeckKey,
      difficulty: origin.difficulty,
      gameMode: "standard",
      setupTurns: origin.preparationTurns,
    });
  }
  if (origin.deterministicRevision !== OPAQUE_MATCH_DETERMINISTIC_REVISION) {
    throw new Error(`Opaque origin revision "${origin.deterministicRevision}" has no history ruleset registration.`);
  }
  return Object.freeze({
    seedKind: "opaque",
    rngSeed: origin.rngSeed,
    playerDeckKey: origin.playerDeckKey,
    hostDeckKey: origin.hostDeckKey,
    difficulty: origin.difficulty,
    gameMode: "standard",
    setupTurns: origin.preparationTurns,
    contentRevision: origin.observedContentRevision,
    rulesetVersion: OPAQUE_MATCH_RULESET_VERSION,
  });
}

/** Compatibility is deterministic only. Deck lookup and redundant Canon-field checks stay separate. */
export function evaluateFutureCompatibility(
  future: FutureIdentityV1,
  catalog: ContentCatalog = contentCatalog,
  canonCompatibility: CanonSeedCompatibilityRegistry = CANON_SEED_COMPATIBILITY,
): FutureCompatibilityResult {
  if (future.seedKind === "canon") {
    const registration = canonCompatibility[future.format];
    if (!registration || registration.format !== future.format || !registration.supported) {
      return Object.freeze({ compatible: false, reason: "format" });
    }
    if (registration.rulesetVersion !== CANON_SEED_RULESET_VERSION) {
      return Object.freeze({ compatible: false, reason: "ruleset" });
    }
    return Object.freeze({ compatible: true });
  }
  if (future.rulesetVersion !== OPAQUE_MATCH_RULESET_VERSION) {
    return Object.freeze({ compatible: false, reason: "ruleset" });
  }
  if (future.contentRevision !== catalog.revision) {
    return Object.freeze({ compatible: false, reason: "content" });
  }
  return Object.freeze({ compatible: true });
}

export function resolveFutureIdentity(
  future: FutureIdentityV1,
  catalog: ContentCatalog = contentCatalog,
  canonCompatibility: CanonSeedCompatibilityRegistry = CANON_SEED_COMPATIBILITY,
): FutureResolutionResult {
  if (!evaluateFutureCompatibility(future, catalog, canonCompatibility).compatible) {
    return Object.freeze({ ok: false, reason: "deterministic-incompatible" });
  }

  if (future.seedKind === "canon") {
    try {
      catalog.requireDeck(future.playerDeckKey, "player");
      catalog.requireDeck(future.hostDeckKey, "host");
    } catch {
      return Object.freeze({ ok: false, reason: "deck-unavailable" });
    }
    let origin;
    try {
      origin = importCanonMatchOrigin(future.canonCode, catalog, canonCompatibility);
    } catch {
      return Object.freeze({ ok: false, reason: "identity-mismatch" });
    }
    if (
      origin.canonFormat !== future.format ||
      origin.canonCode !== future.canonCode.toUpperCase() ||
      origin.rngSeed !== future.rngSeed ||
      origin.playerDeckKey !== future.playerDeckKey ||
      origin.hostDeckKey !== future.hostDeckKey ||
      origin.difficulty !== future.difficulty ||
      origin.gameMode !== future.gameMode ||
      origin.preparationTurns !== future.setupTurns
    ) return Object.freeze({ ok: false, reason: "identity-mismatch" });
    return Object.freeze({ ok: true, origin });
  }

  try {
    catalog.requireDeck(future.playerDeckKey, "player");
    catalog.requireDeck(future.hostDeckKey, "host");
  } catch {
    return Object.freeze({ ok: false, reason: "deck-unavailable" });
  }
  return Object.freeze({
    ok: true,
    origin: createOpaqueMatchOrigin({
      rngSeed: future.rngSeed,
      playerDeckKey: future.playerDeckKey,
      hostDeckKey: future.hostDeckKey,
      difficulty: future.difficulty,
      preparationTurns: future.setupTurns,
      gameMode: future.gameMode,
      deterministicRevision: OPAQUE_MATCH_DETERMINISTIC_REVISION,
    }, catalog),
  });
}
