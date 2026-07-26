import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID, findCardDefinition, getHordeDeck, getPlayerDeck } from "../data/decks";
import { MAX_PLAYER_LANDS, playerLandCount } from "../engine/GameRules";
import { createCardInstance, createInitialGame } from "../engine/GameState";
import type { CardInstance, DifficultyMode, GameMode, GameState, Phase, Side } from "../engine/GameTypes";
import { STORED_MANA_CAP, emptyManaPool } from "../engine/ManaSystem";

/** Bump when the shape changes in a way older exported JSON can't satisfy.
 *  v2 replaced the per-color mana pool with the two resources the game actually has: energy
 *  sources on the battlefield, and stored energy in the pool. */
export const SCENARIO_VERSION = 2;

export type ScenarioZoneKey =
  | "playerHand"
  | "playerBattlefield"
  | "playerGraveyard"
  | "playerExile"
  | "playerLibraryTop"
  | "hordeBattlefield"
  | "hordeGraveyard"
  | "hordeExile"
  | "hordeLibraryTop";

export type ScenarioCard = {
  definitionId: string;
  /** Copies to place. Defaults to 1. */
  amount?: number;
  tapped?: boolean;
  /** Scenario cards are assumed to have been in play already; defaults to false. */
  summoningSickness?: boolean;
  damageMarked?: number;
  counters?: Record<string, number>;
};

/**
 * The game has ONE resource, shown as energy: untapped lands on the battlefield are available
 * energy, and the colorless pool is stored energy (capped at `STORED_MANA_CAP`). The engine's
 * `ManaPool` still carries colors because card costs are printed in Magic symbols, but nothing the
 * player sees is per-color — so a scenario configures energy, not colors.
 */
export type ScenarioDefinition = {
  version: number;
  name: string;
  playerDeckId: string;
  hordeDeckId: string;
  seed: string;
  difficulty: DifficultyMode;
  gameMode: GameMode;
  turnNumber: number;
  hordeTurnNumber: number;
  phase: Phase;
  activeSide: Side;
  player: {
    life: number;
    /** Untapped energy sources (lands) on the battlefield, capped at `MAX_PLAYER_LANDS`. */
    energy: number;
    /** Stored energy in the pool, capped at `STORED_MANA_CAP`. */
    storedEnergy: number;
  };
  horde: { poisonCounters: number };
  zones: Partial<Record<ScenarioZoneKey, ScenarioCard[]>>;
};

export const SCENARIO_ZONE_SIDES: Record<ScenarioZoneKey, Side> = {
  playerHand: "player",
  playerBattlefield: "player",
  playerGraveyard: "player",
  playerExile: "player",
  playerLibraryTop: "player",
  hordeBattlefield: "horde",
  hordeGraveyard: "horde",
  hordeExile: "horde",
  hordeLibraryTop: "horde",
};

const ZONE_SIDES = SCENARIO_ZONE_SIDES;

export const SCENARIO_ZONES: Array<{ id: ScenarioZoneKey; label: string; side: Side }> = [
  { id: "playerHand", label: "Player hand", side: "player" },
  { id: "playerBattlefield", label: "Player battlefield", side: "player" },
  { id: "playerGraveyard", label: "Player graveyard", side: "player" },
  { id: "playerExile", label: "Player exile", side: "player" },
  { id: "playerLibraryTop", label: "Player library (top)", side: "player" },
  { id: "hordeBattlefield", label: "Horde battlefield", side: "horde" },
  { id: "hordeGraveyard", label: "Horde graveyard", side: "horde" },
  { id: "hordeExile", label: "Horde exile", side: "horde" },
  { id: "hordeLibraryTop", label: "Horde library (top)", side: "horde" },
];

export const BLANK_SCENARIO: ScenarioDefinition = {
  version: SCENARIO_VERSION,
  name: "Blank scenario",
  playerDeckId: DEFAULT_PLAYER_DECK_ID,
  hordeDeckId: DEFAULT_HORDE_DECK_ID,
  seed: "playground01",
  difficulty: "normal",
  gameMode: "standard",
  turnNumber: 1,
  hordeTurnNumber: 0,
  phase: "main",
  activeSide: "player",
  // Full energy by default, sources and reserve both: a blank board you cannot cast anything from
  // is not a useful starting point for testing a card.
  player: { life: 50, energy: MAX_PLAYER_LANDS, storedEnergy: STORED_MANA_CAP },
  horde: { poisonCounters: 0 },
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
 * and the library is whatever the deck holds minus what the scenario places.
 */
export function snapshotScenario(game: GameState, base: ScenarioDefinition): ScenarioDefinition {
  return {
    ...cloneScenario(base),
    turnNumber: game.turnNumber,
    hordeTurnNumber: game.hordeTurnNumber,
    phase: game.phase,
    activeSide: game.activeSide,
    player: {
      life: game.player.life,
      // Lands are captured as ordinary battlefield entries below (tapped state included), so the
      // top-up field has to stay at zero or a reload would add a second set of them.
      energy: 0,
      storedEnergy: Math.min(game.player.manaPool.colorless, STORED_MANA_CAP),
    },
    horde: { poisonCounters: game.horde.poisonCounters },
    zones: {
      playerHand: groupCards(game.player.hand),
      playerBattlefield: groupCards(game.player.battlefield),
      playerGraveyard: groupCards(game.player.graveyard),
      playerExile: groupCards(game.player.exile),
      hordeBattlefield: groupCards(game.horde.battlefield),
      hordeGraveyard: groupCards(game.horde.graveyard),
      hordeExile: groupCards(game.horde.exile),
    },
  };
}

/** Board-library snapshots deliberately keep only the player's hand and both battlefields. */
export function snapshotBoard(game: GameState, base: ScenarioDefinition): ScenarioDefinition {
  const snapshot = snapshotScenario(game, base);
  return {
    ...snapshot,
    turnNumber: 1,
    hordeTurnNumber: 0,
    phase: "main",
    activeSide: "player",
    player: { life: BLANK_SCENARIO.player.life, energy: 0, storedEnergy: 0 },
    horde: { poisonCounters: 0 },
    zones: {
      playerHand: snapshot.zones.playerHand,
      playerBattlefield: snapshot.zones.playerBattlefield,
      hordeBattlefield: snapshot.zones.hordeBattlefield,
    },
  };
}

/** Consecutive identical cards collapse into one entry with an amount. */
// Only consecutive copies collapse. Merging across another card would erase summon chronology
// from saved boards (for example: four tokens, a lord, then a second two-token wave).
function groupCards(cards: CardInstance[]): ScenarioCard[] {
  const groups: Array<{ key: string; entry: ScenarioCard }> = [];
  for (const card of cards) {
    const key = `${card.definitionId}:${card.tapped ? "t" : ""}:${card.damageMarked ?? 0}`;
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
        ...(card.tapped ? { tapped: true } : {}),
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
  if (definition.version > SCENARIO_VERSION) {
    problems.push(`Scenario version ${definition.version} is newer than this build (${SCENARIO_VERSION}).`);
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
    getHordeDeck(scenario.hordeDeckId),
    scenario.seed,
    0,
    scenario.difficulty,
    scenario.gameMode,
  );

  returnPlayerCardsToLibrary(game);
  game.setupTurnsRemaining = 0;
  game.setupCompletePendingHorde = false;
  game.openingHandAccepted = true;
  game.mulligansTaken = 0;
  game.turnNumber = scenario.turnNumber;
  game.hordeTurnNumber = scenario.hordeTurnNumber;
  game.phase = scenario.phase;
  game.activeSide = scenario.activeSide;
  game.player.life = scenario.player.life;
  game.player.manaPool = { ...emptyManaPool(), colorless: clamp(scenario.player.storedEnergy, 0, STORED_MANA_CAP) };
  game.player.pendingStoredMana = 0;
  game.player.energyActionUsedThisTurn = false;
  game.horde.poisonCounters = scenario.horde.poisonCounters;
  delete game.horde.pendingCard;
  game.combat = { playerAttackers: [], hordeAttackers: [], blockers: {}, pendingDamageVolleys: [] };
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
 * The card this deck uses as an energy source. Energy is "an untapped land", so the playground
 * never hardcodes Forest: it takes whatever land the player deck actually runs.
 */
export function playerEnergyDefinitionId(game: GameState): string | undefined {
  const zones = [game.player.battlefield, game.player.library, game.player.hand, game.player.graveyard];
  for (const zone of zones) {
    const land = zone.find((card) => card.cardTypes.includes("Land"));
    if (land) return land.definitionId;
  }
  return undefined;
}

/** Puts untapped energy sources on the player's battlefield, never past `MAX_PLAYER_LANDS`.
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
    placeCard(game, "playerBattlefield", card, { definitionId });
    placed += 1;
  }
  return placed;
}

function withScenarioDefaults(definition: ScenarioDefinition): ScenarioDefinition {
  return {
    ...BLANK_SCENARIO,
    ...definition,
    player: { ...BLANK_SCENARIO.player, ...definition.player },
    horde: { ...BLANK_SCENARIO.horde, ...definition.horde },
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
 * play). A scenario defines its own zones, so those cards go back to the top of the library in the
 * order they left it — the library ends up in exactly its post-shuffle order.
 */
function returnPlayerCardsToLibrary(game: GameState): void {
  const returned = [...game.player.hand, ...game.player.battlefield];
  for (const card of returned) {
    card.zone = "library";
    card.tapped = false;
    card.summoningSickness = card.cardTypes.includes("Creature");
  }
  game.player.hand = [];
  game.player.battlefield = [];
  game.player.library = [...returned, ...game.player.library];
}

function applyZones(game: GameState, scenario: ScenarioDefinition): void {
  const counter = { next: 0 };
  // Library tops are applied last so the cards placed elsewhere are already out of the library and
  // can't be pulled twice; within a zone, the listed order is the resulting order.
  const zones = zoneEntries(scenario).sort(([a], [b]) => Number(a.endsWith("LibraryTop")) - Number(b.endsWith("LibraryTop")));
  for (const [zone, entries] of zones) {
    if (zone.endsWith("LibraryTop")) {
      const side = ZONE_SIDES[zone];
      const staged: CardInstance[] = [];
      for (const entry of entries) {
        for (let copy = 0; copy < (entry.amount ?? 1); copy += 1) {
          const card = takeCard(game, side, entry.definitionId, counter);
          if (!card) continue;
          card.zone = "library";
          staged.push(card);
        }
      }
      game[side].library.unshift(...staged);
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
 * Prefers a real copy out of that side's library so deck counts stay honest, and only mints a new
 * instance when the deck doesn't have one (e.g. testing a Goblin token in a Zombie match). Either
 * way the result is a normal `CardInstance`, never a playground-only shape.
 */
function takeCard(game: GameState, side: Side, definitionId: string, counter: { next: number }): CardInstance | undefined {
  const library = game[side].library;
  const index = library.findIndex((card) => card.definitionId === definitionId);
  if (index >= 0) return library.splice(index, 1)[0];
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
    game.player.library, game.player.hand, game.player.battlefield, game.player.graveyard, game.player.exile,
    game.horde.library, game.horde.battlefield, game.horde.graveyard, game.horde.exile,
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
    if (zone.endsWith("LibraryTop")) {
      card.zone = "library";
      staged.push(card);
    } else {
      placeCard(next, zone, card, entry);
    }
    placed += 1;
  }
  if (staged.length > 0) next[side].library.unshift(...staged);
  if (placed === 0) {
    next.lastActionResult = { ok: false, reason: `Unknown card "${entry.definitionId}".` };
    return next;
  }
  next.lastActionResult = { ok: true };
  next.log.unshift(`Playground places ${placed}x ${entry.definitionId} into ${zone}.`);
  return next;
}

/** Stages an authored Horde queue atomically so duplicate definitions become distinct instances. */
export function stageHordeQueue(game: GameState, entries: ScenarioCard[]): GameState {
  const next = structuredClone(game) as GameState;
  const counter = { next: 0 };
  const staged: CardInstance[] = [];
  for (const entry of entries) {
    for (let copy = 0; copy < (entry.amount ?? 1); copy += 1) {
      const card = takeCard(next, "horde", entry.definitionId, counter);
      if (!card) {
        next.lastActionResult = { ok: false, reason: `Unknown card "${entry.definitionId}".` };
        return next;
      }
      card.zone = "library";
      staged.push(card);
    }
  }
  next.horde.library.unshift(...staged);
  next.lastActionResult = { ok: true };
  next.log.unshift(`Playground stages ${staged.length} Horde card(s).`);
  return next;
}

/** Temporarily overrides only reveal-shaping rules for a hand-authored Playground Horde turn. */
export function configureExactHordeTurn(game: GameState, count: number): GameState {
  const next = structuredClone(game) as GameState;
  next.hordeRules = {
    ...next.hordeRules,
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
  card.tapped = false;
  card.summoningSickness = false;
  card.damageMarked = 0;
  card.activatedThisTurn = false;

  if (zone === "playerLibraryTop" || zone === "hordeLibraryTop") {
    card.zone = "library";
    game[side].library.unshift(card);
    return;
  }
  if (zone === "playerHand") {
    card.zone = "hand";
    game.player.hand.push(card);
    return;
  }
  if (zone === "playerGraveyard" || zone === "hordeGraveyard") {
    card.zone = "graveyard";
    game[side].graveyard.push(card);
    return;
  }
  if (zone === "playerExile" || zone === "hordeExile") {
    card.zone = "exile";
    game[side].exile.push(card);
    return;
  }

  card.zone = "battlefield";
  card.tapped = entry.tapped ?? false;
  card.summoningSickness = entry.summoningSickness ?? false;
  card.damageMarked = entry.damageMarked ?? 0;
  if (entry.counters) card.counters = { ...card.counters, ...entry.counters };
  game[side].battlefield.push(card);
}
