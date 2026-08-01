import { DEFAULT_HOST_DECK_ID, DEFAULT_PLAYER_DECK_ID, findCardDefinition, getHostDeck, getPlayerDeck } from "../data/decks";
import { MAX_PLAYER_LANDS, playerLandCount } from "../engine/GameRules";
import { createCardInstance, createInitialGame } from "../engine/GameState";
import type { CardInstance, DifficultyMode, GameMode, GameState, Phase, Side } from "../engine/GameTypes";
import { STORED_ENERGY_CAP, emptyEnergyPool } from "../engine/EnergySystem";

/** Bump when the shape changes in a way older exported JSON can't satisfy.
 *  v3 is the first Hostfall-native Playground contract; v1/v2 are intentionally unsupported. */
export const SCENARIO_VERSION = 3;

export type ScenarioZoneKey =
  | "playerHand"
  | "playerField"
  | "playerMemory"
  | "playerOblivion"
  | "playerArchiveTop"
  | "hostField"
  | "hostMemory"
  | "hostOblivion"
  | "hostArchiveTop";

export type ScenarioCard = {
  definitionId: string;
  /** Copies to place. Defaults to 1. */
  amount?: number;
  exhausted?: boolean;
  /** Scenario cards are assumed to have been in play already; defaults to false. */
  stabilizing?: boolean;
  damageMarked?: number;
  counters?: Record<string, number>;
};

/**
 * The game has one resource: ready Sources provide available Energy, and the Energy Pool holds
 * Stored Energy (capped at `STORED_ENERGY_CAP`). Scenarios configure those two visible quantities.
 */
export type ScenarioDefinition = {
  version: number;
  name: string;
  playerDeckId: string;
  hostDeckId: string;
  seed: string;
  difficulty: DifficultyMode;
  gameMode: GameMode;
  turnNumber: number;
  hostTurnNumber: number;
  phase: Phase;
  activeSide: Side;
  player: {
    life: number;
    /** Ready Energy Sources on the Field, capped at `MAX_PLAYER_LANDS`. */
    energy: number;
    /** Stored energy in the pool, capped at `STORED_ENERGY_CAP`. */
    storedEnergy: number;
  };
  host: { poisonCounters: number };
  zones: Partial<Record<ScenarioZoneKey, ScenarioCard[]>>;
};

export const SCENARIO_ZONE_SIDES: Record<ScenarioZoneKey, Side> = {
  playerHand: "player",
  playerField: "player",
  playerMemory: "player",
  playerOblivion: "player",
  playerArchiveTop: "player",
  hostField: "host",
  hostMemory: "host",
  hostOblivion: "host",
  hostArchiveTop: "host",
};

const ZONE_SIDES = SCENARIO_ZONE_SIDES;

export const SCENARIO_ZONES: Array<{ id: ScenarioZoneKey; label: string; side: Side }> = [
  { id: "playerHand", label: "Player hand", side: "player" },
  { id: "playerField", label: "Chronicler Field", side: "player" },
  { id: "playerMemory", label: "Chronicler Memory", side: "player" },
  { id: "playerOblivion", label: "Chronicler Oblivion", side: "player" },
  { id: "playerArchiveTop", label: "Chronicler Archive (top)", side: "player" },
  { id: "hostField", label: "Host Field", side: "host" },
  { id: "hostMemory", label: "Host Memory", side: "host" },
  { id: "hostOblivion", label: "Host Oblivion", side: "host" },
  { id: "hostArchiveTop", label: "Host Archive (top)", side: "host" },
];

export const BLANK_SCENARIO: ScenarioDefinition = {
  version: SCENARIO_VERSION,
  name: "Blank scenario",
  playerDeckId: DEFAULT_PLAYER_DECK_ID,
  hostDeckId: DEFAULT_HOST_DECK_ID,
  seed: "playground01",
  difficulty: "normal",
  gameMode: "standard",
  turnNumber: 1,
  hostTurnNumber: 0,
  phase: "main",
  activeSide: "player",
  // Full energy by default, sources and reserve both: a blank board you cannot cast anything from
  // is not a useful starting point for testing a card.
  player: { life: 50, energy: MAX_PLAYER_LANDS, storedEnergy: STORED_ENERGY_CAP },
  host: { poisonCounters: 0 },
  zones: {},
};

export function cloneScenario(definition: ScenarioDefinition): ScenarioDefinition {
  return structuredClone(definition);
}

/**
 * Reads a live game back into a scenario definition. This is what "Save" stores, and it is the
 * reason there is no separate draft of zones to keep in sync: the board on screen IS the scenario.
 * You place cards, you look at them, you save what you are looking at.
 *
 * Libraries are deliberately not captured — a scenario is a starting position, not a save state,
 * and the Archive is whatever the deck holds minus what the scenario places.
 */
export function snapshotScenario(game: GameState, base: ScenarioDefinition): ScenarioDefinition {
  return {
    ...cloneScenario(base),
    turnNumber: game.turnNumber,
    hostTurnNumber: game.hostTurnNumber,
    phase: game.phase,
    activeSide: game.activeSide,
    player: {
      life: game.player.life,
      // Sources are captured as ordinary Field entries below (exhausted state included), so the
      // top-up field has to stay at zero or a reload would add a second set of them.
      energy: 0,
      storedEnergy: Math.min(game.player.energyPool.stored, STORED_ENERGY_CAP),
    },
    host: { poisonCounters: game.host.poisonCounters },
    zones: {
      playerHand: groupCards(game.player.hand),
      playerField: groupCards(game.player.field),
      playerMemory: groupCards(game.player.memory),
      playerOblivion: groupCards(game.player.oblivion),
      hostField: groupCards(game.host.field),
      hostMemory: groupCards(game.host.memory),
      hostOblivion: groupCards(game.host.oblivion),
    },
  };
}

/** Board snapshots deliberately keep only the player's Hand and both Fields. */
export function snapshotBoard(game: GameState, base: ScenarioDefinition): ScenarioDefinition {
  const snapshot = snapshotScenario(game, base);
  return {
    ...snapshot,
    turnNumber: 1,
    hostTurnNumber: 0,
    phase: "main",
    activeSide: "player",
    player: { life: BLANK_SCENARIO.player.life, energy: 0, storedEnergy: 0 },
    host: { poisonCounters: 0 },
    zones: {
      playerHand: snapshot.zones.playerHand,
      playerField: snapshot.zones.playerField,
      hostField: snapshot.zones.hostField,
    },
  };
}

/** Consecutive identical cards collapse into one entry with an amount. */
// Only consecutive copies collapse. Merging across another card would erase summon chronology
// from saved boards (for example: four tokens, a lord, then a second two-token wave).
function groupCards(cards: CardInstance[]): ScenarioCard[] {
  const groups: Array<{ key: string; entry: ScenarioCard }> = [];
  for (const card of cards) {
    const key = `${card.definitionId}:${card.exhausted ? "e" : ""}:${card.damageMarked ?? 0}`;
    const previous = groups[groups.length - 1];
    if (previous?.key === key) {
      previous.entry.amount = (previous.entry.amount ?? 1) + 1;
      continue;
    }
    groups.push({
      key,
      entry: {
        definitionId: card.definitionId,
        amount: 1,
        ...(card.exhausted ? { exhausted: true } : {}),
        ...(card.damageMarked ? { damageMarked: card.damageMarked } : {}),
      },
    });
  }
  return groups.map(({ entry }) => entry);
}

/** Problems the UI should surface before starting. `buildScenarioGame` silently skips whatever
 *  this reports, so a scenario never half-loads with an unexplained missing card. */
export function validateScenario(definition: ScenarioDefinition): string[] {
  const problems: string[] = [];
  const source = definition as unknown as Record<string, unknown>;
  if (definition.version !== SCENARIO_VERSION) {
    problems.push(
      definition.version < SCENARIO_VERSION
        ? `Scenario version ${definition.version} is retired; this build requires ${SCENARIO_VERSION}.`
        : `Scenario version ${definition.version} is newer than this build (${SCENARIO_VERSION}).`,
    );
  }
  for (const key of ["name", "playerDeckId", "hostDeckId", "seed"] as const) {
    if (typeof source[key] !== "string") problems.push(`Scenario is missing Hostfall v3 field "${key}".`);
  }
  if (source.activeSide !== "player" && source.activeSide !== "host") {
    problems.push('Scenario activeSide must be "player" or "host".');
  }
  if (!new Set<Phase>(["untap", "draw", "main", "combat", "end", "host"]).has(source.phase as Phase)) {
    problems.push(`Unknown scenario phase "${String(source.phase)}".`);
  }
  if (typeof source.player !== "object" || source.player === null || typeof source.host !== "object" || source.host === null) {
    problems.push('Scenario v3 requires both "player" and "host" state.');
  }
  if (typeof source.turnNumber !== "number" || typeof source.hostTurnNumber !== "number") {
    problems.push('Scenario v3 requires numeric "turnNumber" and "hostTurnNumber".');
  }
  if (typeof source.zones !== "object" || source.zones === null || Array.isArray(source.zones)) {
    problems.push('Scenario v3 requires a "zones" object.');
    return problems;
  }
  for (const zone of Object.keys(source.zones)) {
    if (!(zone in ZONE_SIDES)) problems.push(`Unknown scenario zone "${zone}".`);
  }
  for (const [zone, entries] of zoneEntries(definition)) {
    for (const entry of entries) {
      if (!findCardDefinition(entry.definitionId)) {
        problems.push(`Unknown card "${entry.definitionId}" in ${zone}.`);
      }
      if ((entry.amount ?? 1) < 1) problems.push(`Invalid amount for "${entry.definitionId}" in ${zone}.`);
    }
  }
  return problems;
}

/**
 * Builds a full `GameState` from a scenario definition — always from scratch, never by patching a
 * live state. That is what makes "restart scenario" byte-identical to "start scenario": same seed,
 * same shuffle, same RNG position, same instance ids.
 */
export function buildScenarioGame(definition: ScenarioDefinition): GameState {
  const scenario = withScenarioDefaults(definition);
  const game = createInitialGame(
    getPlayerDeck(scenario.playerDeckId),
    getHostDeck(scenario.hostDeckId),
    scenario.seed,
    0,
    scenario.difficulty,
    scenario.gameMode,
  );

  returnPlayerCardsToLibrary(game);
  game.setupTurnsRemaining = 0;
  game.setupCompletePendingHost = false;
  game.openingHandAccepted = true;
  game.mulligansTaken = 0;
  game.turnNumber = scenario.turnNumber;
  game.hostTurnNumber = scenario.hostTurnNumber;
  game.phase = scenario.phase;
  game.activeSide = scenario.activeSide;
  game.player.life = scenario.player.life;
  game.player.energyPool = { ...emptyEnergyPool(), stored: clamp(scenario.player.storedEnergy, 0, STORED_ENERGY_CAP) };
  game.player.pendingStoredEnergy = 0;
  game.player.energyActionUsedThisTurn = false;
  game.host.poisonCounters = scenario.host.poisonCounters;
  delete game.host.pendingCard;
  game.combat = { playerAttackers: [], hostAttackers: [], blockers: {}, pendingDamageVolleys: [] };
  game.eventQueue = [];
  delete game.winner;
  delete game.lastActionResult;

  applyZones(game, scenario);
  // After the zones: a scenario that lists its own lands already spent part of the land cap, and
  // the energy field only tops up whatever room is left.
  placeEnergySources(game, scenario.player.energy);
  game.log = [`Playground scenario "${scenario.name}" loaded with seed "${scenario.seed}".`];
  return game;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));
}

/**
 * The card this deck uses as an Energy Source. Available Energy is represented by a ready Source, so the Playground
 * never hardcodes Forest: it takes whatever land the player deck actually runs.
 */
export function playerEnergyDefinitionId(game: GameState): string | undefined {
  const zones = [game.player.field, game.player.archive, game.player.hand, game.player.memory];
  for (const zone of zones) {
    const land = zone.find((card) => card.kinds.includes("SOURCE"));
    if (land) return land.definitionId;
  }
  return undefined;
}

/** Puts ready Energy Sources on the player's Field, never past `MAX_PLAYER_LANDS`.
 *  Returns how many actually landed so callers can report a real number. */
export function placeEnergySources(game: GameState, requested: number): number {
  const definitionId = playerEnergyDefinitionId(game);
  if (!definitionId) return 0;
  const room = Math.min(clamp(requested, 0, MAX_PLAYER_LANDS), MAX_PLAYER_LANDS - playerLandCount(game));
  const counter = { next: 0 };
  let placed = 0;
  for (let copy = 0; copy < room; copy += 1) {
    const card = takeCard(game, "player", definitionId, counter);
    if (!card) break;
    placeCard(game, "playerField", card, { definitionId });
    placed += 1;
  }
  return placed;
}

function withScenarioDefaults(definition: ScenarioDefinition): ScenarioDefinition {
  return {
    ...BLANK_SCENARIO,
    ...definition,
    player: { ...BLANK_SCENARIO.player, ...definition.player },
    host: { ...BLANK_SCENARIO.host, ...definition.host },
    zones: { ...definition.zones },
  };
}

function zoneEntries(definition: ScenarioDefinition): Array<[ScenarioZoneKey, ScenarioCard[]]> {
  return (Object.keys(ZONE_SIDES) as ScenarioZoneKey[])
    .map((zone) => [zone, definition.zones[zone] ?? []] as [ScenarioZoneKey, ScenarioCard[]])
    .filter(([, entries]) => entries.length > 0);
}

/**
 * `createInitialGame` always draws an opening hand (and, for some seeds/modes, puts permanents in
 * play). A scenario defines its own zones, so those cards go back to the top of the Archive in the
 * order they left it — the Archive ends up in exactly its post-shuffle order.
 */
function returnPlayerCardsToLibrary(game: GameState): void {
  const returned = [...game.player.hand, ...game.player.field];
  for (const card of returned) {
    card.zone = "archive";
    card.exhausted = false;
    card.stabilizing = card.kinds.includes("ECHO");
  }
  game.player.hand = [];
  game.player.field = [];
  game.player.archive = [...returned, ...game.player.archive];
}

function applyZones(game: GameState, scenario: ScenarioDefinition): void {
  const counter = { next: 0 };
  // Archive tops are applied last so the cards placed elsewhere are already out of the Archive and
  // can't be pulled twice; within a zone, the listed order is the resulting order.
  const zones = zoneEntries(scenario).sort(([a], [b]) => Number(a.endsWith("ArchiveTop")) - Number(b.endsWith("ArchiveTop")));
  for (const [zone, entries] of zones) {
    if (zone.endsWith("ArchiveTop")) {
      const side = ZONE_SIDES[zone];
      const staged: CardInstance[] = [];
      for (const entry of entries) {
        for (let copy = 0; copy < (entry.amount ?? 1); copy += 1) {
          const card = takeCard(game, side, entry.definitionId, counter);
          if (!card) continue;
          card.zone = "archive";
          staged.push(card);
        }
      }
      game[side].archive.unshift(...staged);
      continue;
    }
    for (const entry of entries) {
      for (let copy = 0; copy < (entry.amount ?? 1); copy += 1) {
        const card = takeCard(game, ZONE_SIDES[zone], entry.definitionId, counter);
        if (!card) continue;
        placeCard(game, zone, card, entry);
      }
    }
  }
}

/**
 * Prefers a real copy out of that side's Archive so deck counts stay honest, and only mints a new
 * instance when the deck doesn't have one (e.g. testing a Goblin token in a Zombie match). Either
 * way the result is a normal `CardInstance`, never a playground-only shape.
 */
function takeCard(game: GameState, side: Side, definitionId: string, counter: { next: number }): CardInstance | undefined {
  const archive = game[side].archive;
  const index = archive.findIndex((card) => card.definitionId === definitionId);
  if (index >= 0) return archive.splice(index, 1)[0];
  const definition = findCardDefinition(definitionId);
  if (!definition) return undefined;
  let instanceId = "";
  do {
    counter.next += 1;
    instanceId = `playground-${side}-${definitionId}-${counter.next}`;
  } while (instanceIdTaken(game, instanceId));
  return createCardInstance(definition, side, instanceId);
}

function instanceIdTaken(game: GameState, instanceId: string): boolean {
  const zones = [
    game.player.archive, game.player.hand, game.player.field, game.player.memory, game.player.oblivion,
    game.host.archive, game.host.field, game.host.memory, game.host.oblivion,
  ];
  return zones.some((zone) => zone.some((card) => card.instanceId === instanceId));
}

/**
 * Adds cards to a LIVE game — the Playground's "place" action. Same code path as building a
 * scenario, so a placed card is an ordinary `CardInstance` in an ordinary zone. It does not run
 * enter-the-battlefield triggers: that is the separate "resolve" action, which goes through the
 * engine's normal cast/reveal flow.
 */
export function addScenarioCard(game: GameState, zone: ScenarioZoneKey, entry: ScenarioCard): GameState {
  const next = structuredClone(game) as GameState;
  const side = SCENARIO_ZONE_SIDES[zone];
  const counter = { next: 0 };
  let placed = 0;
  const staged: CardInstance[] = [];
  for (let copy = 0; copy < (entry.amount ?? 1); copy += 1) {
    const card = takeCard(next, side, entry.definitionId, counter);
    if (!card) break;
    if (zone.endsWith("ArchiveTop")) {
      card.zone = "archive";
      staged.push(card);
    } else {
      placeCard(next, zone, card, entry);
    }
    placed += 1;
  }
  if (staged.length > 0) next[side].archive.unshift(...staged);
  if (placed === 0) {
    next.lastActionResult = { ok: false, reason: `Unknown card "${entry.definitionId}".` };
    return next;
  }
  next.lastActionResult = { ok: true };
  next.log.unshift(`Playground places ${placed}x ${entry.definitionId} into ${zone}.`);
  return next;
}

/** Stages an authored Host queue atomically so duplicate definitions become distinct instances. */
export function stageHostQueue(game: GameState, entries: ScenarioCard[]): GameState {
  const next = structuredClone(game) as GameState;
  const counter = { next: 0 };
  const staged: CardInstance[] = [];
  for (const entry of entries) {
    for (let copy = 0; copy < (entry.amount ?? 1); copy += 1) {
      const card = takeCard(next, "host", entry.definitionId, counter);
      if (!card) {
        next.lastActionResult = { ok: false, reason: `Unknown card "${entry.definitionId}".` };
        return next;
      }
      card.zone = "archive";
      staged.push(card);
    }
  }
  next.host.archive.unshift(...staged);
  next.lastActionResult = { ok: true };
  next.log.unshift(`Playground stages ${staged.length} Host card(s).`);
  return next;
}

/** Temporarily overrides only reveal-shaping rules for a hand-authored Playground Host turn. */
export function configureExactHostTurn(game: GameState, count: number): GameState {
  const next = structuredClone(game) as GameState;
  next.hostRules = {
    ...next.hostRules,
    revealCount: Math.max(0, count),
    stopOnNonToken: false,
    miniSurgeTurn: Number.MAX_SAFE_INTEGER,
    miniSurgeExtraReveals: 0,
    surgeTurn: Number.MAX_SAFE_INTEGER,
    surgeTurnChaos: Number.MAX_SAFE_INTEGER,
    surgeExtraReveals: 0,
  };
  return next;
}

function placeCard(game: GameState, zone: ScenarioZoneKey, card: CardInstance, entry: ScenarioCard): void {
  const side = ZONE_SIDES[zone];
  card.exhausted = false;
  card.stabilizing = false;
  card.damageMarked = 0;
  card.activatedThisTurn = false;

  if (zone === "playerArchiveTop" || zone === "hostArchiveTop") {
    card.zone = "archive";
    game[side].archive.unshift(card);
    return;
  }
  if (zone === "playerHand") {
    card.zone = "hand";
    game.player.hand.push(card);
    return;
  }
  if (zone === "playerMemory" || zone === "hostMemory") {
    card.zone = "memory";
    game[side].memory.push(card);
    return;
  }
  if (zone === "playerOblivion" || zone === "hostOblivion") {
    card.zone = "oblivion";
    game[side].oblivion.push(card);
    return;
  }

  card.zone = "field";
  card.exhausted = entry.exhausted ?? false;
  card.stabilizing = entry.stabilizing ?? false;
  card.damageMarked = entry.damageMarked ?? 0;
  if (entry.counters) card.counters = { ...card.counters, ...entry.counters };
  game[side].field.push(card);
}
