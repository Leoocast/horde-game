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
    effects: normalizeTriggeredAbilities(card.abilities ?? []),
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

function normalizeTriggeredAbilities(abilities: NewDeckAbility[]): EffectDefinition[] {
  return abilities
    .filter((ability) => ability.kind === "TRIGGERED")
    .map(normalizeTriggeredAbility)
    .filter(Boolean) as EffectDefinition[];
}

function normalizeTriggeredAbility(ability: NewDeckAbility): EffectDefinition | undefined {
  const trigger = normalizeTriggerEvent(String(ability.trigger?.event ?? ""));
  const effect = normalizeEffect(ability.effects?.[0] as EffectDefinition | undefined);
  if (!trigger || !effect) return undefined;
  return {
    type: "TRIGGERED_ABILITY",
    trigger,
    condition: normalizeTriggerCondition(ability),
    effect,
  };
}

function normalizeTriggerEvent(event: string): string | undefined {
  if (event === "ENTERS_BATTLEFIELD") return "CREATURE_ENTERS_BATTLEFIELD";
  return event || undefined;
}

function normalizeTriggerCondition(ability: NewDeckAbility): EffectDefinition | undefined {
  const conditions = Array.isArray(ability.conditions) ? (ability.conditions as Array<Record<string, unknown>>) : [];
  const eventObjectMatch = conditions.find((condition) => condition.type === "EVENT_OBJECT_MATCHES");
  if (!eventObjectMatch) return undefined;
  const filters = eventObjectMatch.filters as { cardTypes?: string[]; subtypes?: string[] } | undefined;
  if (eventObjectMatch.controller === "SELF" && eventObjectMatch.excludeSource && filters?.cardTypes?.includes("Creature")) {
    return { type: "ANOTHER_PERMANENT_YOU_CONTROL_ENTERED", filters };
  }
  return {
    type: "EVENT_OBJECT_MATCHES",
    controller: eventObjectMatch.controller,
    excludeSource: eventObjectMatch.excludeSource,
    filters,
  };
}

function normalizeEffect(effect?: EffectDefinition): EffectDefinition | undefined {
  if (!effect) return undefined;
  if (effect.type === "MODIFY_STATS") {
    return {
      type: effect.duration === "END_OF_TURN" ? "PUMP_UNTIL_END_OF_TURN" : "PUMP",
      target: normalizeTarget(effect.target),
      power: effect.power ?? 0,
      toughness: effect.toughness ?? 0,
    };
  }
  if (effect.type === "ADD_COUNTERS") {
    return {
      type: "PUT_COUNTER",
      target: normalizeTarget(effect.target),
      counterType: effect.counter ?? effect.counterType ?? "+1/+1",
      amount: effect.amount ?? 1,
    };
  }
  return effect;
}

function normalizeTarget(target: unknown): unknown {
  if (target === "SELF") return "SELF";
  return target;
}

function normalizeSide(side?: string): Side {
  return side === "HORDE" || side === "horde" ? "horde" : "player";
}
