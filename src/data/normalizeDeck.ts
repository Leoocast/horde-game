import type { ActivatedAbility, CardDefinition, DeckList, EffectDefinition, Side } from "../engine/GameTypes";
import type { NewDeckAbility, NewDeckCard, NewDeckList } from "./deckCatalog";

export function normalizeDeck(rawDeck: NewDeckList): DeckList {
  return {
    id: rawDeck.id,
    name: rawDeck.name,
    side: normalizeSide(rawDeck.side),
    deckSize: rawDeck.deckSize ?? rawDeck.cards.reduce((total, card) => total + (card.quantity ?? 1), 0),
    cards: rawDeck.cards.map(normalizeCard),
    tokens: rawDeck.tokens?.map(normalizeCard),
  };
}

function normalizeCard(card: NewDeckCard): CardDefinition {
  return {
    id: card.id,
    name: card.name,
    displayNameEs: card.displayNameEs,
    quantity: card.quantity,
    isToken: Boolean(card.isToken),
    manaCost: card.manaCost ?? "",
    manaValue: card.manaValue ?? 0,
    colors: card.colors,
    cardTypes: card.cardTypes,
    subtypes: card.subtypes,
    power: card.power,
    toughness: card.toughness,
    keywords: card.keywords,
    activatedAbilities: normalizeActivatedAbilities(card.abilities ?? []),
    effects: [],
  };
}

function normalizeActivatedAbilities(abilities: NewDeckAbility[]): ActivatedAbility[] {
  return abilities
    .filter((ability) => ability.kind === "ACTIVATED")
    .map((ability) => {
      const firstEffect = ability.effects?.[0] as EffectDefinition | undefined;
      return {
        id: ability.id ?? "activated_ability",
        cost: ability.cost,
        requiresTargets: [],
        effect: firstEffect ?? { type: "UNSUPPORTED" },
      };
    });
}

function normalizeSide(side?: string): Side {
  return side === "HORDE" || side === "horde" ? "horde" : "player";
}
