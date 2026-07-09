import type { CardDefinition, CardInstance, DeckList, GameState, Side } from "./GameTypes";
import { emptyManaPool } from "./ManaSystem";
import { hashSeed, shuffleWithState } from "./RNG";

export function createInitialGame(playerDeck: DeckList, hordeDeck: DeckList, seed = "horde-seed", setupTurns = 5): GameState {
  const playerCards = expandDeck(playerDeck, "player");
  const hordeCards = expandDeck(hordeDeck, "horde");
  let randomState = hashSeed(seed);
  const shuffledPlayer = shuffleWithState(playerCards, randomState);
  randomState = shuffledPlayer.randomState;
  const shuffledHorde = shuffleWithState(hordeCards, randomState);
  randomState = shuffledHorde.randomState;

  const game: GameState = {
    seed,
    currentRandomState: randomState,
    hordeDeckOrderHash: shuffledHorde.items.map((card) => card.definitionId).join("|"),
    activeSide: "player",
    phase: "main",
    turnNumber: 1,
    setupTurnsRemaining: setupTurns,
    setupCompletePendingHorde: false,
    player: {
      life: 20,
      library: shuffledPlayer.items,
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      manaPool: emptyManaPool(),
      landPlayedThisTurn: false,
    },
    horde: {
      library: shuffledHorde.items,
      battlefield: [],
      graveyard: [],
      exile: [],
    },
    combat: { playerAttackers: [], hordeAttackers: [], blockers: {} },
    eventQueue: [],
    log: [],
  };

  drawCards(game, "player", 7);
  game.log.unshift(`Game started with seed "${seed}". Player draws 7. Setup turns: ${setupTurns}.`);
  return game;
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
    displayName: definition.displayNameEs ?? definition.name,
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
    damageMarked: 0,
    deathtouchDamage: false,
    counters,
    temporaryPower: 0,
    temporaryToughness: 0,
    temporaryKeywords: [],
    chosenColor,
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
