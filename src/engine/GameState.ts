import type { CardDefinition, CardInstance, DeckList, DifficultyMode, GameMode, GameState, Keyword, Side } from "./GameTypes";
import { buildHordeRules } from "./HordeRules";
import { emptyEnergyPool } from "./EnergySystem";
import { hashSeed, shuffleWithState } from "./RNG";
import { buildChaosMutations, prepareChaosDeck } from "./ChaosMode";

const DEVELOPER_SEED = "developer";
const STANDARD_STARTING_LIFE = 50;
const CHAOS_STARTING_LIFE = 35;
const DEFAULT_PLAYER_DECK_LAND_COUNT = 9;
const DEVELOPER_OPENING_HAND = ["broken_wings", "broken_wings"];
const DEVELOPER_RANDOM_OPENING_CARDS = 5;
const DEVELOPER_HORDE_OPENING_ARCHIVE = ["goblin_token_1_1_red", "rundvelt_hordemaster"];
const DEVELOPER_HORDE_PROTECTED_OPENING_SIZE = 2;
const DEVELOPER_STARTING_LAND_COUNT = 4;

export function createInitialGame(
  playerDeck: DeckList,
  hordeDeck: DeckList,
  seed = "hostfall-seed",
  setupTurns = 4,
  difficulty: DifficultyMode = "normal",
  gameMode: GameMode = "standard",
): GameState {
  const activePlayerDeck = gameMode === "chaos" ? prepareChaosDeck(playerDeck) : playerDeck;
  const activeHordeDeck = gameMode === "chaos" ? prepareChaosDeck(hordeDeck) : hordeDeck;
  const chaosMutations = gameMode === "chaos"
    ? {
        player: buildChaosMutations(activePlayerDeck, "player", seed),
        horde: buildChaosMutations(activeHordeDeck, "horde", seed),
      }
    : { player: {}, horde: {} };
  const playerCards = limitPlayerDeckLands(
    expandDeck(activePlayerDeck, "player", chaosMutations.player),
    activePlayerDeck.gameplayLandCount ?? DEFAULT_PLAYER_DECK_LAND_COUNT,
  );
  const hordeCards = expandDeck(activeHordeDeck, "horde", chaosMutations.horde);
  const effectiveSetupTurns = gameMode === "chaos" ? 0 : setupTurns;
  let randomState = hashSeed(seed);
  const shuffledPlayer = shuffleWithState(playerCards, randomState);
  randomState = shuffledPlayer.randomState;
  const playerArchive = applyDeveloperOpeningHand(seed, shuffledPlayer.items);
  const shuffledHorde = shuffleWithState(hordeCards, randomState);
  randomState = shuffledHorde.randomState;
  const hordeArchive = applyDeveloperHordeOpeningArchive(seed, shuffledHorde.items);

  const game: GameState = {
    seed,
    difficulty,
    gameMode,
    hordeRules: buildHordeRules(activeHordeDeck.rulesProfile),
    chaosMutations,
    currentRandomState: randomState,
    hordeDeckOrderHash: hordeArchive.map((card) => card.definitionId).join("|"),
    activeSide: "player",
    phase: "main",
    turnNumber: 1,
    hordeTurnNumber: 0,
    setupTurnsRemaining: effectiveSetupTurns,
    setupCompletePendingHorde: false,
    openingHandAccepted: false,
    mulligansTaken: 0,
    player: {
      life: seed.trim().toLowerCase() === DEVELOPER_SEED
        ? 999
        : gameMode === "chaos"
          ? CHAOS_STARTING_LIFE
          : STANDARD_STARTING_LIFE,
      archive: playerArchive,
      hand: [],
      field: [],
      memory: [],
      oblivion: [],
      energyPool: emptyEnergyPool(),
      pendingStoredEnergy: 0,
      energyActionUsedThisTurn: false,
      lifePaidThisTurn: 0,
      lifeLostThisTurn: 0,
    },
    horde: {
      archive: hordeArchive,
      field: [],
      memory: [],
      oblivion: [],
      poisonCounters: 0,
    },
    combat: { playerAttackers: [], hordeAttackers: [], blockers: {}, pendingDamageVolleys: [] },
    fieldEntriesThisTurn: [],
    eventQueue: [],
    log: [],
  };

  applyChaosStartingEnergy(game);
  applyDeveloperStartingBattlefield(game);
  const openingHandSize = seed.trim().toLowerCase() === DEVELOPER_SEED ? DEVELOPER_OPENING_HAND.length + DEVELOPER_RANDOM_OPENING_CARDS : 7;
  drawCards(game, "player", openingHandSize);
  game.log.unshift(`Game started with seed "${seed}". Player draws ${openingHandSize}. Setup turns: ${effectiveSetupTurns}. Mode: ${gameMode}.`);
  return game;
}

export function recordFieldEntry(game: GameState, card: CardInstance): void {
  card.fieldEntryTurn = card.controller === "horde" ? game.hordeTurnNumber : game.turnNumber;
  game.fieldEntriesThisTurn.push({
    instanceId: card.instanceId,
    controller: card.controller,
    cardTypes: [...card.cardTypes],
    subtypes: [...card.subtypes],
  });
}

export function acceptOpeningHand(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  if (next.openingHandAccepted) return next;
  next.openingHandAccepted = true;
  next.log.unshift(`Player keeps an opening hand of ${next.player.hand.length} card(s).`);
  return next;
}

export function mulliganOpeningHand(game: GameState): GameState {
  const next = structuredClone(game) as GameState;
  if (next.openingHandAccepted || next.player.hand.length <= 1) return next;

  const nextHandSize = next.player.hand.length - 1;
  const returnedCards = next.player.hand;
  for (const card of returnedCards) card.zone = "archive";
  const shuffled = shuffleWithState([...returnedCards, ...next.player.archive], next.currentRandomState);
  next.currentRandomState = shuffled.randomState;
  next.player.hand = [];
  next.player.archive = shuffled.items;
  drawCards(next, "player", nextHandSize);
  next.mulligansTaken += 1;
  next.log.unshift(`Player takes mulligan ${next.mulligansTaken} and draws ${nextHandSize} card(s).`);
  return next;
}

function forceCardsToFront(archive: CardInstance[], definitionIds: readonly string[]): { forced: CardInstance[]; remaining: CardInstance[] } {
  const remaining = [...archive];
  const forced: CardInstance[] = [];
  for (const definitionId of definitionIds) {
    const index = remaining.findIndex((card) => card.definitionId === definitionId);
    if (index < 0) continue;
    const [card] = remaining.splice(index, 1);
    forced.push(card);
  }
  return { forced, remaining };
}

function applyDeveloperOpeningHand(seed: string, archive: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== DEVELOPER_SEED) return archive;
  const { forced, remaining } = forceCardsToFront(archive, DEVELOPER_OPENING_HAND);
  return [...forced, ...remaining];
}

function applyDeveloperHordeOpeningArchive(seed: string, archive: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== DEVELOPER_SEED) return archive;
  const { forced, remaining } = forceCardsToFront(archive, DEVELOPER_HORDE_OPENING_ARCHIVE);
  const ordered = [...forced, ...remaining];
  for (let index = 0; index < Math.min(DEVELOPER_HORDE_PROTECTED_OPENING_SIZE, ordered.length); index += 1) {
    if (ordered[index].definitionId !== "graf_harvest") continue;
    const replacementIndex = ordered.findIndex(
      (card, candidateIndex) => candidateIndex >= DEVELOPER_HORDE_PROTECTED_OPENING_SIZE && card.definitionId !== "graf_harvest",
    );
    if (replacementIndex < 0) break;
    [ordered[index], ordered[replacementIndex]] = [ordered[replacementIndex], ordered[index]];
  }
  return ordered;
}

function placeOnBattlefield(game: GameState, entries: readonly { definitionId: string; amount: number }[]): void {
  for (const entry of entries) {
    for (let index = 0; index < entry.amount; index += 1) {
      const archiveIndex = game.player.archive.findIndex((card) => card.definitionId === entry.definitionId);
      if (archiveIndex < 0) break;
      const [card] = game.player.archive.splice(archiveIndex, 1);
      card.zone = "field";
      card.tapped = false;
      card.summoningSickness = false;
      game.player.field.push(card);
    }
  }
}

function applyDeveloperStartingBattlefield(game: GameState): void {
  if (game.seed.trim().toLowerCase() !== DEVELOPER_SEED) return;
  const landId = game.player.archive.find((card) => card.cardTypes.includes("SOURCE"))?.definitionId;
  if (!landId) return;
  placeOnBattlefield(game, [{ definitionId: landId, amount: DEVELOPER_STARTING_LAND_COUNT }]);
}

function limitPlayerDeckLands(cards: CardInstance[], maximum: number): CardInstance[] {
  let landsKept = 0;
  return cards.filter((card) => {
    if (!card.cardTypes.includes("SOURCE")) return true;
    landsKept += 1;
    return landsKept <= maximum;
  });
}

function applyChaosStartingEnergy(game: GameState): void {
  if (game.gameMode !== "chaos") return;
  const normalizedSeed = game.seed.trim().toLowerCase();
  if (normalizedSeed === DEVELOPER_SEED) return;
  placeOnBattlefield(game, [{ definitionId: game.player.archive.find((card) => card.cardTypes.includes("SOURCE"))?.definitionId ?? "", amount: 1 }]);
}

export function expandDeck(deck: DeckList, side: Side, chaosMutations: Record<string, Keyword[]> = {}): CardInstance[] {
  const allDefinitions = [...(deck.cards ?? [])];
  return allDefinitions.flatMap((definition) =>
    Array.from({ length: definition.quantity ?? 1 }, (_, copyIndex) =>
      createCardInstance(definition, side, `${side}-${definition.id}-${copyIndex}`, chaosMutations[definition.id]),
    ),
  );
}

export function createToken(definition: CardDefinition, side: Side, suffix: string, chaosKeywords?: Keyword[]): CardInstance {
  return createCardInstance({ ...definition, isToken: true }, side, `${side}-token-${definition.id}-${suffix}`, chaosKeywords);
}

export function createCardInstance(definition: CardDefinition, side: Side, instanceId: string, chaosKeywords?: Keyword[]): CardInstance {
  const counters: Record<string, number> = {};
  for (const counter of definition.entersWithCounters ?? []) {
    counters[counter.counterType] = (counters[counter.counterType] ?? 0) + (counter.amount ?? 0);
  }
  return {
    instanceId,
    definitionId: definition.id,
    name: definition.name,
    displayName: definition.name,
    displayNameEs: definition.displayNameEs,
    gameText: definition.gameText,
    owner: side,
    controller: side,
    zone: "archive",
    isToken: Boolean(definition.isToken),
    energyCost: definition.energyCost ?? 0,
    cardTypes: definition.cardTypes ?? [],
    modifiers: definition.modifiers ?? [],
    subtypes: definition.subtypes ?? [],
    basePower: definition.power ?? 0,
    baseToughness: definition.toughness ?? 0,
    keywords: chaosKeywords ? [...chaosKeywords] : definition.keywords ?? [],
    chaosKeywords: chaosKeywords ? [...chaosKeywords] : [],
    triggerMessage: definition.triggerMessage,
    effects: definition.effects ?? [],
    additionalCost: definition.additionalCost,
    activatedAbilities: definition.activatedAbilities ?? [],
    requiresTargets: definition.requiresTargets ?? [],
    tapped: false,
    entersTapped: Boolean(definition.entersTapped),
    summoningSickness: (definition.cardTypes ?? []).includes("ECHO"),
    attacksMade: 0,
    activatedThisTurn: false,
    damageMarked: 0,
    lethalDamage: false,
    counters,
    temporaryPower: 0,
    temporaryToughness: 0,
    untilNextPlayerTurnPower: 0,
    untilNextPlayerTurnToughness: 0,
    temporaryKeywords: [],
    attachTo: definition.attachTo,
    flags: { ...(definition.flags ?? {}) },
    variableCost: definition.variableCost,
  };
}

export function drawCards(game: GameState, side: "player", amount: number): void {
  for (let i = 0; i < amount; i += 1) {
    const card = game[side].archive.shift();
    if (!card) break;
    card.zone = "hand";
    game[side].hand.push(card);
  }
}
