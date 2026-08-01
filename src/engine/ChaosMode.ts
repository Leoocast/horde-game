import type { CardDefinition, DeckList, Trait, Side } from "./GameTypes";
import { hashSeed, nextRandom } from "./RNG";

const SECOND_KEYWORD_CHANCE = 0.25;
const THIRD_KEYWORD_CHANCE = 0.2;
const FOURTH_KEYWORD_CHANCE = 0.1;

export function prepareChaosDeck(deck: DeckList): DeckList {
  const cards = deck.cards.filter(isChaosDeckCard);
  const tokens = deck.tokens?.filter(isChaosDeckCard);
  return {
    ...deck,
    cards,
    tokens,
    deckSize: cards.reduce((total, card) => total + (card.quantity ?? 1), 0),
  };
}

export function buildChaosMutations(deck: DeckList, side: Side, seed: string): Record<string, Trait[]> {
  const pool = chaosTraitPool(deck);
  const creatures = uniqueDefinitions([...(deck.cards ?? []), ...(deck.tokens ?? [])].filter(isCreature));
  let randomState = hashSeed(`${seed}:chaos:${side}:${deck.id}`);
  const mutations: Record<string, Trait[]> = {};

  const random = () => {
    const [value, nextState] = nextRandom(randomState);
    randomState = nextState;
    return value;
  };

  for (const creature of creatures) {
    const available = [...pool];
    const traits: Trait[] = [];
    if (available.length > 0) takeTrait(available, traits, random);

    let continuationChance = SECOND_KEYWORD_CHANCE;
    while (available.length > 0 && random() < continuationChance) {
      takeTrait(available, traits, random);
      continuationChance = nextContinuationChance(traits.length);
    }
    mutations[creature.id] = traits;
  }

  return mutations;
}

export function chaosTraitPool(deck: DeckList): Trait[] {
  const pool = [...(deck.cards ?? []), ...(deck.tokens ?? [])]
    .filter(isCreature)
    .flatMap((card) => card.traits ?? [])
    .filter((keyword) => String(keyword).trim().toUpperCase() !== "IMPETUS");
  return [...new Set(pool)];
}

export function isChaosDeckCard(card: CardDefinition): boolean {
  const types = card.kinds ?? [];
  return types.some((type) => type === "ECHO" || type === "SOURCE" || type === "SPELL");
}

function isCreature(card: CardDefinition): boolean {
  return (card.kinds ?? []).includes("ECHO");
}

function uniqueDefinitions(definitions: CardDefinition[]): CardDefinition[] {
  const seen = new Set<string>();
  return definitions.filter((definition) => {
    if (seen.has(definition.id)) return false;
    seen.add(definition.id);
    return true;
  });
}

function takeTrait(available: Trait[], traits: Trait[], random: () => number): void {
  const index = Math.floor(random() * available.length);
  const [keyword] = available.splice(index, 1);
  if (keyword) traits.push(keyword);
}

function nextContinuationChance(keywordCount: number): number {
  if (keywordCount === 2) return THIRD_KEYWORD_CHANCE;
  if (keywordCount === 3) return FOURTH_KEYWORD_CHANCE;
  return FOURTH_KEYWORD_CHANCE / 2 ** (keywordCount - 3);
}
