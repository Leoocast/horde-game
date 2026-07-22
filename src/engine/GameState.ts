import type { CardDefinition, CardInstance, DeckList, DifficultyMode, GameMode, GameState, Keyword, Side } from "./GameTypes";
import { emptyManaPool } from "./ManaSystem";
import { hashSeed, shuffleWithState } from "./RNG";
import { buildChaosMutations, prepareChaosDeck } from "./ChaosMode";

const DEVELOPER_SEED = "developer";
const STANDARD_STARTING_LIFE = 40;
const CHAOS_STARTING_LIFE = 35;
const PLAYER_DECK_LAND_COUNT = 9;
const DEVELOPER_OPENING_HAND = ["broken_wings", "broken_wings"];
const DEVELOPER_RANDOM_OPENING_CARDS = 5;
const DEVELOPER_HORDE_OPENING_LIBRARY = ["goblin_token_1_1_red", "rundvelt_hordemaster"];
const DEVELOPER_HORDE_PROTECTED_OPENING_SIZE = 2;
const DEVELOPER_STARTING_BATTLEFIELD = [
  { definitionId: "forest", amount: 4 },
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
    PLAYER_DECK_LAND_COUNT,
  );
  const hordeCards = expandDeck(activeHordeDeck, "horde", chaosMutations.horde);
  const effectiveSetupTurns = gameMode === "chaos" ? 0 : setupTurns;
  let randomState = hashSeed(seed);
  const shuffledPlayer = shuffleWithState(playerCards, randomState);
  randomState = shuffledPlayer.randomState;
  const playerLibrary = applyTutorialOpeningHand(seed, applyDeveloperOpeningHand(seed, shuffledPlayer.items));
  const shuffledHorde = shuffleWithState(hordeCards, randomState);
  randomState = shuffledHorde.randomState;
  const hordeLibrary = applyTutorialHordeOpeningLibrary(seed, applyDeveloperHordeOpeningLibrary(seed, shuffledHorde.items));

  const game: GameState = {
    seed,
    difficulty,
    gameMode,
    chaosMutations,
    currentRandomState: randomState,
    hordeDeckOrderHash: hordeLibrary.map((card) => card.definitionId).join("|"),
    activeSide: "player",
    phase: "main",
    turnNumber: 1,
    hordeTurnNumber: 0,
    setupTurnsRemaining: effectiveSetupTurns,
    setupCompletePendingHorde: false,
    player: {
      life: seed.trim().toLowerCase() === DEVELOPER_SEED
        ? 999
        : gameMode === "chaos"
          ? CHAOS_STARTING_LIFE
          : STANDARD_STARTING_LIFE,
      library: playerLibrary,
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      manaPool: emptyManaPool(),
      pendingStoredMana: 0,
      energyActionUsedThisTurn: false,
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

  applyChaosStartingEnergy(game);
  applyDeveloperStartingBattlefield(game);
  applyTutorialStartingBattlefield(game);
  const openingHandSize = seed.trim().toLowerCase() === DEVELOPER_SEED ? DEVELOPER_OPENING_HAND.length + DEVELOPER_RANDOM_OPENING_CARDS : 7;
  drawCards(game, "player", openingHandSize);
  game.log.unshift(`Game started with seed "${seed}". Player draws ${openingHandSize}. Setup turns: ${effectiveSetupTurns}. Mode: ${gameMode}.`);
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

function limitPlayerDeckLands(cards: CardInstance[], maximum: number): CardInstance[] {
  let landsKept = 0;
  return cards.filter((card) => {
    if (!card.cardTypes.includes("Land")) return true;
    landsKept += 1;
    return landsKept <= maximum;
  });
}

function applyChaosStartingEnergy(game: GameState): void {
  if (game.gameMode !== "chaos") return;
  const normalizedSeed = game.seed.trim().toLowerCase();
  if (normalizedSeed === DEVELOPER_SEED || normalizedSeed === TUTORIAL_SEED) return;
  placeOnBattlefield(game, [{ definitionId: game.player.library.find((card) => card.cardTypes.includes("Land"))?.definitionId ?? "", amount: 1 }]);
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
    displayNameEs: definition.displayNameEs,
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
    keywords: chaosKeywords ? [...chaosKeywords] : definition.keywords ?? [],
    chaosKeywords: chaosKeywords ? [...chaosKeywords] : [],
    triggerMessage: definition.triggerMessage,
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
