import type { CardDefinition, CardInstance, DeckList, Side, Trait } from "./GameTypes";
import { hashSeed, shuffleWithState } from "./RNG";

export const DEFAULT_PLAYER_DECK_SOURCE_COUNT = 9;

export type InitialDeckMutations = Readonly<{
  player: Readonly<Record<string, readonly Trait[]>>;
  host: Readonly<Record<string, readonly Trait[]>>;
}>;

export type InitialDeckPools = Readonly<{
  player: readonly CardInstance[];
  host: readonly CardInstance[];
}>;

export type InitialDeckOrder = Readonly<{
  playerArchive: CardInstance[];
  hostArchive: CardInstance[];
  randomState: number;
}>;

const EMPTY_MUTATIONS: InitialDeckMutations = Object.freeze({
  player: Object.freeze({}),
  host: Object.freeze({}),
});

/**
 * Expands both selected decks once. Search tooling can retain these pools and only repeat the
 * reference shuffles; normal gameplay consumes the same preparation path.
 */
export function prepareInitialDeckPools(
  playerDeck: DeckList,
  hostDeck: DeckList,
  mutations: InitialDeckMutations = EMPTY_MUTATIONS,
): InitialDeckPools {
  return {
    player: limitPlayerDeckSources(
      expandDeck(playerDeck, "player", mutations.player),
      playerDeck.gameplayLandCount ?? DEFAULT_PLAYER_DECK_SOURCE_COUNT,
    ),
    host: expandDeck(hostDeck, "host", mutations.host),
  };
}

/** Preserves the engine contract: the Chronicler shuffle consumes the RNG stream before the Host. */
export function shuffleInitialDeckOrder(pools: InitialDeckPools, seed: string): InitialDeckOrder {
  let randomState = hashSeed(seed);
  const player = shuffleWithState([...pools.player], randomState);
  randomState = player.randomState;
  const host = shuffleWithState([...pools.host], randomState);
  return {
    playerArchive: player.items,
    hostArchive: host.items,
    randomState: host.randomState,
  };
}

export function limitPlayerDeckSources(cards: readonly CardInstance[], maximum: number): CardInstance[] {
  let sourcesKept = 0;
  return cards.filter((card) => {
    if (!card.kinds.includes("SOURCE")) return true;
    sourcesKept += 1;
    return sourcesKept <= maximum;
  });
}

export function expandDeck(
  deck: DeckList,
  side: Side,
  chaosMutations: Readonly<Record<string, readonly Trait[]>> = {},
): CardInstance[] {
  const allDefinitions = [...(deck.cards ?? [])];
  return allDefinitions.flatMap((definition) =>
    Array.from({ length: definition.quantity ?? 1 }, (_, copyIndex) =>
      createCardInstance(definition, side, `${side}-${definition.id}-${copyIndex}`, chaosMutations[definition.id]),
    ),
  );
}

export function createCardInstance(
  definition: CardDefinition,
  side: Side,
  instanceId: string,
  chaosTraits?: readonly Trait[],
): CardInstance {
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
    kinds: definition.kinds ?? [],
    modifiers: definition.modifiers ?? [],
    subtypes: definition.subtypes ?? [],
    basePower: definition.power ?? 0,
    baseEndurance: definition.endurance ?? 0,
    traits: chaosTraits ? [...chaosTraits] : definition.traits ?? [],
    chaosTraits: chaosTraits ? [...chaosTraits] : [],
    triggerMessage: definition.triggerMessage,
    effects: definition.effects ?? [],
    additionalCost: definition.additionalCost,
    activatedAbilities: definition.activatedAbilities ?? [],
    requiresTargets: definition.requiresTargets ?? [],
    exhausted: false,
    entersExhausted: Boolean(definition.entersExhausted),
    stabilizing: (definition.kinds ?? []).includes("ECHO"),
    attacksMade: 0,
    activatedThisTurn: false,
    damageMarked: 0,
    lethalDamage: false,
    counters,
    temporaryPower: 0,
    temporaryEndurance: 0,
    untilNextPlayerTurnPower: 0,
    untilNextPlayerTurnEndurance: 0,
    temporaryTraits: [],
    attachTo: definition.attachTo,
    flags: { ...(definition.flags ?? {}) },
    variableCost: definition.variableCost,
  };
}
