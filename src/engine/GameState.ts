import type { CardDefinition, CardInstance, DeckList, GameState, Side } from "./GameTypes";
import { emptyManaPool } from "./ManaSystem";
import { hashSeed, shuffleWithState } from "./RNG";

const DEVELOPER_SEED = "developer";
const DEVELOPER_OPENING_HAND = ["broken_wings", "broken_wings"];
const DEVELOPER_RANDOM_OPENING_CARDS = 5;
const DEVELOPER_HORDE_OPENING_LIBRARY = ["zombie_token", "zombie_token", "diregraf_captain"];
const DEVELOPER_STARTING_BATTLEFIELD = [
  { definitionId: "forest", amount: 5 },
] as const;

export function createInitialGame(playerDeck: DeckList, hordeDeck: DeckList, seed = "horde-seed", setupTurns = 5): GameState {
  const playerCards = expandDeck(playerDeck, "player");
  const hordeCards = expandDeck(hordeDeck, "horde");
  let randomState = hashSeed(seed);
  const shuffledPlayer = shuffleWithState(playerCards, randomState);
  randomState = shuffledPlayer.randomState;
  const playerLibrary = applyDeveloperOpeningHand(seed, shuffledPlayer.items);
  const shuffledHorde = shuffleWithState(hordeCards, randomState);
  randomState = shuffledHorde.randomState;
  const hordeLibrary = applyDeveloperHordeOpeningLibrary(seed, shuffledHorde.items);

  const game: GameState = {
    seed,
    currentRandomState: randomState,
    hordeDeckOrderHash: hordeLibrary.map((card) => card.definitionId).join("|"),
    activeSide: "player",
    phase: "main",
    turnNumber: 1,
    setupTurnsRemaining: setupTurns,
    setupCompletePendingHorde: false,
    player: {
      life: seed.trim().toLowerCase() === DEVELOPER_SEED ? 50 : 20,
      library: playerLibrary,
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      manaPool: emptyManaPool(),
      landPlayedThisTurn: false,
    },
    horde: {
      library: hordeLibrary,
      battlefield: [],
      graveyard: [],
      exile: [],
      poisonCounters: 0,
    },
    combat: { playerAttackers: [], hordeAttackers: [], blockers: {} },
    eventQueue: [],
    log: [],
  };

  applyDeveloperStartingBattlefield(game);
  const openingHandSize = seed.trim().toLowerCase() === DEVELOPER_SEED ? DEVELOPER_OPENING_HAND.length + DEVELOPER_RANDOM_OPENING_CARDS : 7;
  drawCards(game, "player", openingHandSize);
  game.log.unshift(`Game started with seed "${seed}". Player draws ${openingHandSize}. Setup turns: ${setupTurns}.`);
  return game;
}

function applyDeveloperOpeningHand(seed: string, library: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== DEVELOPER_SEED) return library;

  const remaining = [...library];
  const opening: CardInstance[] = [];
  for (const definitionId of DEVELOPER_OPENING_HAND) {
    const index = remaining.findIndex((card) => card.definitionId === definitionId);
    if (index < 0) continue;
    const [card] = remaining.splice(index, 1);
    opening.push(card);
  }
  return [...opening, ...remaining];
}

function applyDeveloperHordeOpeningLibrary(seed: string, library: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== DEVELOPER_SEED) return library;

  const remaining = [...library];
  const opening: CardInstance[] = [];
  for (const definitionId of DEVELOPER_HORDE_OPENING_LIBRARY) {
    const index = remaining.findIndex((card) => card.definitionId === definitionId);
    if (index < 0) continue;
    const [card] = remaining.splice(index, 1);
    opening.push(card);
  }
  return [...opening, ...remaining];
}

function applyDeveloperStartingBattlefield(game: GameState): void {
  if (game.seed.trim().toLowerCase() !== DEVELOPER_SEED) return;

  for (const entry of DEVELOPER_STARTING_BATTLEFIELD) {
    for (let index = 0; index < entry.amount; index += 1) {
      const libraryIndex = game.player.library.findIndex((card) => card.definitionId === entry.definitionId);
      if (libraryIndex < 0) break;
      const [card] = game.player.library.splice(libraryIndex, 1);
      card.zone = "battlefield";
      card.tapped = false;
      card.summoningSickness = false;
      game.player.battlefield.push(card);
    }
  }
}

export function expandDeck(deck: DeckList, side: Side): CardInstance[] {
  const allDefinitions = [...(deck.cards ?? [])];
  return allDefinitions.flatMap((definition) =>
    Array.from({ length: definition.quantity ?? 1 }, (_, copyIndex) => createCardInstance(definition, side, `${side}-${definition.id}-${copyIndex}`)),
  );
}

export function createToken(definition: CardDefinition, side: Side, suffix: string): CardInstance {
  return createCardInstance({ ...definition, isToken: true }, side, `${side}-token-${definition.id}-${suffix}`);
}

export function createCardInstance(definition: CardDefinition, side: Side, instanceId: string): CardInstance {
  const chosenColor = definition.asEnters?.find((entry) => entry.storeAs === "chosenColor")?.defaultForThisDeck;
  const counters: Record<string, number> = {};
  for (const counter of definition.entersWithCounters ?? []) {
    counters[counter.counterType] = (counters[counter.counterType] ?? 0) + (counter.amount ?? 0);
  }
  return {
    instanceId,
    definitionId: definition.id,
    name: definition.name,
    displayName: definition.name,
    owner: side,
    controller: side,
    zone: "library",
    isToken: Boolean(definition.isToken),
    manaCost: definition.manaCost ?? "",
    manaValue: definition.manaValue ?? 0,
    colors: definition.colors ?? [],
    cardTypes: definition.cardTypes ?? [],
    subtypes: definition.subtypes ?? [],
    basePower: definition.power ?? 0,
    baseToughness: definition.toughness ?? 0,
    keywords: definition.keywords ?? [],
    effects: definition.effects ?? [],
    activatedAbilities: definition.activatedAbilities ?? [],
    requiresTargets: definition.requiresTargets ?? [],
    tapped: false,
    entersTapped: Boolean(definition.entersTapped),
    summoningSickness: (definition.cardTypes ?? []).includes("Creature"),
    activatedThisTurn: false,
    damageMarked: 0,
    deathtouchDamage: false,
    counters,
    temporaryPower: 0,
    temporaryToughness: 0,
    temporaryKeywords: [],
    chosenColor,
    attachTo: definition.attachTo,
    flags: { ...(definition.flags ?? {}) },
    variableCost: definition.variableCost,
  };
}

export function drawCards(game: GameState, side: "player", amount: number): void {
  for (let i = 0; i < amount; i += 1) {
    const card = game[side].library.shift();
    if (!card) break;
    card.zone = "hand";
    game[side].hand.push(card);
  }
}
