import type { CardDefinition, CardInstance, DeckList, GameState, Side } from "./GameTypes";
import { emptyManaPool } from "./ManaSystem";
import { hashSeed, shuffleWithState } from "./RNG";

const DEVELOPER_SEED = "developer";
const DEVELOPER_OPENING_HAND = ["broken_wings", "broken_wings"];
const DEVELOPER_RANDOM_OPENING_CARDS = 5;
const DEVELOPER_HORDE_OPENING_LIBRARY: string[] = [];
const DEVELOPER_STARTING_BATTLEFIELD = [
  { definitionId: "forest", amount: 5 },
] as const;

const TUTORIAL_SEED = "tutorial";
const TUTORIAL_OPENING_HAND = ["forest", "llanowar_elves"];
// Kept tiny on purpose: the tutorial horde library is replaced (not just reordered) with these
// cards. Turn 1 has no attack, so the Horde reveals and attacks with both on its first turn.
// Ichorspit Basilisk can only block/kill one, so the survivor comes back for a second, shorter
// attack/defend round on the Horde's next turn before the match ends.
const TUTORIAL_HORDE_OPENING_LIBRARY = ["zombie_token", "zombie_token"];
const TUTORIAL_STARTING_BATTLEFIELD = [
  { definitionId: "forest", amount: 2 },
  { definitionId: "beast_kin_ranger", amount: 1 },
  { definitionId: "ichorspit_basilisk", amount: 1 },
] as const;

export function createInitialGame(playerDeck: DeckList, hordeDeck: DeckList, seed = "horde-seed", setupTurns = 5): GameState {
  const playerCards = expandDeck(playerDeck, "player");
  const hordeCards = expandDeck(hordeDeck, "horde");
  let randomState = hashSeed(seed);
  const shuffledPlayer = shuffleWithState(playerCards, randomState);
  randomState = shuffledPlayer.randomState;
  const playerLibrary = applyTutorialOpeningHand(seed, applyDeveloperOpeningHand(seed, shuffledPlayer.items));
  const shuffledHorde = shuffleWithState(hordeCards, randomState);
  randomState = shuffledHorde.randomState;
  const hordeLibrary = applyTutorialHordeOpeningLibrary(seed, applyDeveloperHordeOpeningLibrary(seed, shuffledHorde.items));

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
      life: seed.trim().toLowerCase() === DEVELOPER_SEED ? 50 : 30,
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
  applyTutorialStartingBattlefield(game);
  const openingHandSize = seed.trim().toLowerCase() === DEVELOPER_SEED ? DEVELOPER_OPENING_HAND.length + DEVELOPER_RANDOM_OPENING_CARDS : 7;
  drawCards(game, "player", openingHandSize);
  game.log.unshift(`Game started with seed "${seed}". Player draws ${openingHandSize}. Setup turns: ${setupTurns}.`);
  return game;
}

function forceCardsToFront(library: CardInstance[], definitionIds: readonly string[]): { forced: CardInstance[]; remaining: CardInstance[] } {
  const remaining = [...library];
  const forced: CardInstance[] = [];
  for (const definitionId of definitionIds) {
    const index = remaining.findIndex((card) => card.definitionId === definitionId);
    if (index < 0) continue;
    const [card] = remaining.splice(index, 1);
    forced.push(card);
  }
  return { forced, remaining };
}

function applyDeveloperOpeningHand(seed: string, library: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== DEVELOPER_SEED) return library;
  const { forced, remaining } = forceCardsToFront(library, DEVELOPER_OPENING_HAND);
  return [...forced, ...remaining];
}

function applyTutorialOpeningHand(seed: string, library: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== TUTORIAL_SEED) return library;
  const { forced, remaining } = forceCardsToFront(library, TUTORIAL_OPENING_HAND);
  return [...forced, ...remaining];
}

function applyDeveloperHordeOpeningLibrary(seed: string, library: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== DEVELOPER_SEED) return library;
  const { forced, remaining } = forceCardsToFront(library, DEVELOPER_HORDE_OPENING_LIBRARY);
  return [...forced, ...remaining];
}

function applyTutorialHordeOpeningLibrary(seed: string, library: CardInstance[]): CardInstance[] {
  if (seed.trim().toLowerCase() !== TUTORIAL_SEED) return library;
  // Replace the whole library, not just reorder it: the tutorial needs to end in one Horde turn.
  const { forced } = forceCardsToFront(library, TUTORIAL_HORDE_OPENING_LIBRARY);
  return forced;
}

function placeOnBattlefield(game: GameState, entries: readonly { definitionId: string; amount: number }[]): void {
  for (const entry of entries) {
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

function applyDeveloperStartingBattlefield(game: GameState): void {
  if (game.seed.trim().toLowerCase() !== DEVELOPER_SEED) return;
  placeOnBattlefield(game, DEVELOPER_STARTING_BATTLEFIELD);
}

function applyTutorialStartingBattlefield(game: GameState): void {
  if (game.seed.trim().toLowerCase() !== TUTORIAL_SEED) return;
  placeOnBattlefield(game, TUTORIAL_STARTING_BATTLEFIELD);
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
