import { contentCatalog } from "../content/bootstrap";
import type { GameState, Phase, Side } from "../engine/GameTypes";

export const RESUME_SAVE_VERSION = 1;

export type ResumeSaveEnvelope = Readonly<{
  kind: "hostfall-resume";
  formatVersion: 1;
  appVersion: string;
  contentRevision: string;
  savedAt: string;
  playerDeckKey: string;
  hostDeckKey: string;
  setupTurns: number;
  playerName: string;
  checkpoint: Readonly<{ game: GameState }>;
}>;

export type ResumeParseResult =
  | Readonly<{ ok: true; save: ResumeSaveEnvelope }>
  | Readonly<{ ok: false; reason: "schema" | "content" | "deck" | "state" }>;

export function createResumeSave(
  game: GameState,
  options: Readonly<{
    appVersion: string;
    playerDeckId: string;
    hostDeckId: string;
    setupTurns: number;
    playerName: string;
    savedAt?: string;
  }>,
): ResumeSaveEnvelope {
  const playerDeck = contentCatalog.requireDeck(options.playerDeckId, "player");
  const hostDeck = contentCatalog.requireDeck(options.hostDeckId, "host");
  return Object.freeze({
    kind: "hostfall-resume",
    formatVersion: RESUME_SAVE_VERSION,
    appVersion: options.appVersion,
    contentRevision: contentCatalog.revision,
    savedAt: options.savedAt ?? new Date().toISOString(),
    playerDeckKey: playerDeck.qualifiedDeckKey,
    hostDeckKey: hostDeck.qualifiedDeckKey,
    setupTurns: Math.max(0, Math.min(20, Math.round(options.setupTurns))),
    playerName: options.playerName.trim().slice(0, 64) || "Chronicler",
    checkpoint: Object.freeze({ game: cloneGame(game) }),
  });
}

export function parseResumeSave(value: unknown): ResumeParseResult {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "kind",
    "formatVersion",
    "appVersion",
    "contentRevision",
    "savedAt",
    "playerDeckKey",
    "hostDeckKey",
    "setupTurns",
    "playerName",
    "checkpoint",
  ])) return { ok: false, reason: "schema" };
  if (value.kind !== "hostfall-resume" || value.formatVersion !== RESUME_SAVE_VERSION) return { ok: false, reason: "schema" };
  if (
    typeof value.appVersion !== "string" ||
    typeof value.savedAt !== "string" ||
    typeof value.playerDeckKey !== "string" ||
    typeof value.hostDeckKey !== "string" ||
    typeof value.playerName !== "string" ||
    !Number.isInteger(value.setupTurns) ||
    (value.setupTurns as number) < 0 ||
    (value.setupTurns as number) > 20 ||
    !isRecord(value.checkpoint) ||
    !hasOnlyKeys(value.checkpoint, ["game"])
  ) return { ok: false, reason: "schema" };
  if (value.contentRevision !== contentCatalog.revision) return { ok: false, reason: "content" };

  let playerDeck;
  let hostDeck;
  try {
    playerDeck = contentCatalog.requireDeck(value.playerDeckKey, "player");
    hostDeck = contentCatalog.requireDeck(value.hostDeckKey, "host");
  } catch {
    return { ok: false, reason: "deck" };
  }
  if (!validateGameState(value.checkpoint.game, playerDeck.deck.id, hostDeck.deck.id)) {
    return { ok: false, reason: "state" };
  }

  return {
    ok: true,
    save: Object.freeze({
      kind: "hostfall-resume",
      formatVersion: RESUME_SAVE_VERSION,
      appVersion: value.appVersion,
      contentRevision: value.contentRevision,
      savedAt: value.savedAt,
      playerDeckKey: playerDeck.qualifiedDeckKey,
      hostDeckKey: hostDeck.qualifiedDeckKey,
      setupTurns: value.setupTurns as number,
      playerName: value.playerName.trim().slice(0, 64) || "Chronicler",
      checkpoint: Object.freeze({ game: cloneGame(value.checkpoint.game as GameState) }),
    }),
  };
}

export function restoreResumeGame(save: ResumeSaveEnvelope): GameState {
  return cloneGame(save.checkpoint.game);
}

function validateGameState(value: unknown, playerDeckId: string, hostDeckId: string): value is GameState {
  if (!isRecord(value) || typeof value.seed !== "string") return false;
  if (!new Set(["easy", "normal", "hard"]).has(value.difficulty as string)) return false;
  if (!new Set(["standard", "chaos"]).has(value.gameMode as string)) return false;
  if (!isSide(value.activeSide) || !isPhase(value.phase)) return false;
  for (const key of ["currentRandomState", "turnNumber", "hostTurnNumber", "setupTurnsRemaining", "mulligansTaken"] as const) {
    if (!Number.isInteger(value[key])) return false;
  }
  for (const key of ["setupCompletePendingHost", "openingHandAccepted"] as const) {
    if (typeof value[key] !== "boolean") return false;
  }
  if (!isRecord(value.player) || !isRecord(value.host) || !isRecord(value.combat)) return false;
  if (typeof value.player.life !== "number" || typeof value.host.poisonCounters !== "number") return false;
  if (!Array.isArray(value.eventQueue) || !Array.isArray(value.log) || !Array.isArray(value.fieldEntriesThisTurn)) return false;
  if (!value.log.every((entry) => typeof entry === "string")) return false;
  if (value.winner !== undefined && !isSide(value.winner)) return false;

  const playerDefinitions = deckDefinitionIds(playerDeckId, "player");
  const hostDefinitions = deckDefinitionIds(hostDeckId, "host");
  const seenInstances = new Set<string>();
  const playerZones = [value.player.archive, value.player.hand, value.player.field, value.player.memory, value.player.oblivion];
  const hostZones = [value.host.archive, value.host.field, value.host.memory, value.host.oblivion];
  if (!playerZones.every(Array.isArray) || !hostZones.every(Array.isArray)) return false;
  for (const card of playerZones.flat()) {
    if (!validateCard(card, playerDefinitions, seenInstances)) return false;
  }
  for (const card of hostZones.flat()) {
    if (!validateCard(card, hostDefinitions, seenInstances)) return false;
  }
  if (value.host.pendingCard !== undefined && !validateCard(value.host.pendingCard, hostDefinitions, seenInstances)) return false;
  return true;
}

function deckDefinitionIds(deckId: string, side: Side): Set<string> {
  const record = contentCatalog.requireDeck(deckId, side);
  return new Set([...(record.deck.cards ?? []), ...(record.deck.tokens ?? [])].map((card) => card.id));
}

function validateCard(value: unknown, definitions: ReadonlySet<string>, seen: Set<string>): boolean {
  if (!isRecord(value) || typeof value.instanceId !== "string" || typeof value.definitionId !== "string") return false;
  if (!definitions.has(value.definitionId) || seen.has(value.instanceId)) return false;
  if (!isSide(value.owner) || !isSide(value.controller)) return false;
  if (!new Set(["archive", "hand", "field", "memory", "oblivion"]).has(value.zone as string)) return false;
  seen.add(value.instanceId);
  return true;
}

function cloneGame(game: GameState): GameState {
  return JSON.parse(JSON.stringify(game)) as GameState;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSide(value: unknown): value is Side {
  return value === "player" || value === "host";
}

function isPhase(value: unknown): value is Phase {
  return value === "untap" || value === "draw" || value === "main" || value === "combat" || value === "end" || value === "host";
}
