import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID, findCardDefinition, getHordeDeck, getPlayerDeck } from "../data/decks";
import { createCardInstance, createInitialGame } from "../engine/GameState";
import type { CardInstance, DifficultyMode, GameMode, GameState, ManaPool, Phase, Side } from "../engine/GameTypes";
import { emptyManaPool } from "../engine/ManaSystem";

/** Bump when the shape changes in a way older exported JSON can't satisfy. */
export const SCENARIO_VERSION = 1;

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
  player: { life: number; mana: Partial<ManaPool> };
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
  seed: "playground",
  difficulty: "normal",
  gameMode: "standard",
  turnNumber: 1,
  hordeTurnNumber: 0,
  phase: "main",
  activeSide: "player",
  player: { life: 50, mana: {} },
  horde: { poisonCounters: 0 },
  zones: {},
};

export function cloneScenario(definition: ScenarioDefinition): ScenarioDefinition {
  return structuredClone(definition);
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
  game.player.manaPool = { ...emptyManaPool(), ...scenario.player.mana };
  game.player.pendingStoredMana = 0;
  game.player.energyActionUsedThisTurn = false;
  game.horde.poisonCounters = scenario.horde.poisonCounters;
  delete game.horde.pendingCard;
  game.combat = { playerAttackers: [], hordeAttackers: [], blockers: {} };
  game.eventQueue = [];
  delete game.winner;
  delete game.lastActionResult;

  applyZones(game, scenario);
  game.log = [`Playground scenario "${scenario.name}" loaded with seed "${scenario.seed}".`];
  return game;
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
  for (let copy = 0; copy < (entry.amount ?? 1); copy += 1) {
    const card = takeCard(next, side, entry.definitionId, counter);
    if (!card) break;
    placeCard(next, zone, card, entry);
    placed += 1;
  }
  if (placed === 0) {
    next.lastActionResult = { ok: false, reason: `Unknown card "${entry.definitionId}".` };
    return next;
  }
  next.lastActionResult = { ok: true };
  next.log.unshift(`Playground places ${placed}x ${entry.definitionId} into ${zone}.`);
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
