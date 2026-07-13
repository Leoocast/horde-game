import type { ActivatedAbility, CardDefinition, DeckList, EffectDefinition, Keyword, Side } from "../engine/GameTypes";
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
    keywords: normalizeKeywords(card),
    activatedAbilities: normalizeActivatedAbilities(card.abilities ?? []),
    effects: [],
  };
}

function normalizeKeywords(card: NewDeckCard): Keyword[] {
  return [...(card.keywords ?? []), ...extractStaticKeywordAbilities(card.abilities ?? [])];
}

function extractStaticKeywordAbilities(abilities: NewDeckAbility[]): Keyword[] {
  const keywords: Keyword[] = [];
  for (const ability of abilities) {
    const customHandler = String(ability.customHandler ?? "");
    const toxic = customHandler.match(/^toxic_(\d+)$/i);
    if (ability.kind === "STATIC" && toxic) keywords.push(`TOXIC_${toxic[1]}`);
  }
  return keywords;
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
