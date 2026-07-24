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
    triggerMessage: card.triggerMessage,
    keywords: normalizeKeywords(card),
    activatedAbilities: normalizeActivatedAbilities(card.abilities ?? []),
    effects: normalizeEffects(card.abilities ?? []),
    requiresTargets: normalizeTargets(card.abilities ?? []),
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

function normalizeEffects(abilities: NewDeckAbility[]): EffectDefinition[] {
  return [
    ...abilities
      .filter((ability) => ability.kind === "STATIC")
      .flatMap(normalizeStaticAbility),
    ...abilities
      .filter((ability) => ability.kind === "TRIGGERED")
      .flatMap(normalizeTriggeredAbility),
    ...abilities
      .filter((ability) => ability.kind === "SPELL")
      .flatMap((ability) => (ability.effects ?? []).map((effect) => normalizeEffect(effect as EffectDefinition)).filter(Boolean)),
  ] as EffectDefinition[];
}

function normalizeStaticAbility(ability: NewDeckAbility): EffectDefinition[] {
  const normalized: EffectDefinition[] = [];
  for (const rawEffect of ability.effects ?? []) {
    const effect = rawEffect as EffectDefinition;
    const scope = effect.scope && typeof effect.scope === "object" ? (effect.scope as Record<string, unknown>) : undefined;
    if (effect.type === "MODIFY_STATS" && effect.duration === "WHILE_SOURCE_ON_BATTLEFIELD") {
      normalized.push({
        type: "STATIC_BUFF",
        controller: scope?.controller ?? "SELF",
        filter: scope?.filters,
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
      });
      continue;
    }
    if (effect.type === "GRANT_KEYWORD" && effect.duration === "WHILE_SOURCE_ON_BATTLEFIELD") {
      normalized.push({
        type: "STATIC_GRANT_KEYWORD",
        controller: scope?.controller ?? "SELF",
        filter: scope?.filters,
        keyword: effect.keyword,
      });
    }
  }
  return normalized;
}

function normalizeTargets(abilities: NewDeckAbility[]) {
  const spell = abilities.find((ability) => ability.kind === "SPELL");
  return (spell?.targets ?? []).map((target) => {
    const req = target as Record<string, unknown>;
    return {
      id: String(req.id ?? "target"),
      type: String(req.filters && Array.isArray((req.filters as Record<string, unknown>).cardTypes) && ((req.filters as Record<string, unknown>).cardTypes as unknown[]).includes("Creature") ? "TARGET_CREATURE" : "TARGET_PERMANENT"),
      controller: req.controller as "SELF" | "OPPONENT" | "ANY" | undefined,
      filters: req.filters,
    };
  });
}

function normalizeTriggeredAbility(ability: NewDeckAbility): EffectDefinition[] {
  const trigger = normalizeTriggerEvent(String(ability.trigger?.event ?? ""), String(ability.trigger?.source ?? ""));
  const customEffect = normalizeCustomTriggeredEffect(ability);
  const effects = customEffect
    ? [customEffect]
    : (ability.effects ?? []).map((effect) => normalizeEffect(effect as EffectDefinition)).filter(Boolean) as EffectDefinition[];
  const effect = effects.length > 1 ? { type: "SEQUENCE", effects } : effects[0];
  if (!trigger || !effect) return [];
  const normalized: EffectDefinition = {
    type: "TRIGGERED_ABILITY",
    trigger,
    condition: normalizeTriggerCondition(ability),
    effect,
  };
  return [normalized];
}

function normalizeCustomTriggeredEffect(ability: NewDeckAbility): EffectDefinition | undefined {
  switch (ability.customHandler) {
    case "rundvelt_hordemaster_exile_top_if_goblin":
      return { type: "HORDE_EXILE_TOP_GOBLIN_TO_BATTLEFIELD" };
    case "battle_cry_goblin_pack_tactics":
      return {
        type: "CONDITIONAL",
        condition: { type: "ATTACK_TOTAL_POWER_AT_LEAST", amount: 6 },
        effect: {
          type: "CREATE_TOKEN",
          tokenId: "goblin_token_1_1_red",
          amount: 1,
          tapped: true,
          attacking: true,
        },
      };
    case "raid_bombardment_small_attacker_damage":
      return {
        type: "DAMAGE_OPPONENT_FOR_EACH_DECLARED_ATTACKER_MATCHING",
        filter: { maxPower: 2 },
        amount: 1,
      };
    case "goblin_rabblemaster_begin_combat_token":
      return { type: "CREATE_TOKEN", tokenId: "goblin_token_1_1_red", amount: 1 };
    case "goblin_rabblemaster_attack_buff":
      return {
        type: "PUMP_SELF_PER_ATTACKER_MATCHING",
        filter: { subtypes: ["Goblin"], excludeSelf: true },
        power: 1,
        toughness: 0,
      };
    case "general_kreat_goblins_attack_token":
      return {
        type: "CONDITIONAL",
        condition: { type: "DECLARED_ATTACKER_MATCHES", filters: { subtypes: ["Goblin"] } },
        effect: {
          type: "CREATE_TOKEN",
          tokenId: "goblin_token_1_1_red",
          amount: 1,
          tapped: true,
          attacking: true,
        },
      };
    case "general_kreat_damage_each_opponent":
      return { type: "DEAL_DAMAGE_TO_OPPONENT", amount: 1 };
    case "goblin_chainwhirler_enter_damage_all":
      return { type: "DEAL_DAMAGE_TO_OPPONENT_AND_CREATURES", amount: 1 };
    default:
      return undefined;
  }
}

function normalizeTriggerEvent(event: string, triggerSource: string): string | undefined {
  if (event === "ENTERS_BATTLEFIELD") return triggerSource === "SELF" ? "ENTERS_BATTLEFIELD" : "CREATURE_ENTERS_BATTLEFIELD";
  if (event === "PERMANENT_DIED") return "CREATURE_DIED";
  return event || undefined;
}

function normalizeTriggerCondition(ability: NewDeckAbility): EffectDefinition | undefined {
  const conditions = Array.isArray(ability.conditions) ? (ability.conditions as Array<Record<string, unknown>>) : [];
  const normalized: EffectDefinition[] = [];
  if (ability.trigger?.event === "ATTACK_DECLARED" && ability.trigger?.source === "SELF") {
    normalized.push({ type: "SOURCE_IS_ATTACKING" });
  }
  const activePlayer = conditions.find((condition) => condition.type === "ACTIVE_PLAYER_IS");
  if (activePlayer) {
    normalized.push({ type: "ACTIVE_PLAYER_IS", player: activePlayer.player });
  }
  const eventObjectMatch = conditions.find((condition) => condition.type === "EVENT_OBJECT_MATCHES");
  if (eventObjectMatch) {
    const filters = eventObjectMatch.filters as { cardTypes?: string[]; subtypes?: string[] } | undefined;
    if (eventObjectMatch.controller === "SELF" && eventObjectMatch.excludeSource && filters?.cardTypes?.includes("Creature")) {
      normalized.push({ type: "ANOTHER_PERMANENT_YOU_CONTROL_ENTERED", filters });
    } else {
      normalized.push({
        type: "EVENT_OBJECT_MATCHES",
        controller: eventObjectMatch.controller,
        excludeSource: eventObjectMatch.excludeSource,
        filters,
      });
    }
  }
  if (normalized.length === 0) return undefined;
  return normalized.length === 1 ? normalized[0] : { type: "ALL_OF", conditions: normalized };
}

function normalizeEffect(effect?: EffectDefinition): EffectDefinition | undefined {
  if (!effect) return undefined;
  if (effect.type === "MODIFY_STATS") {
    const scope = effect.scope && typeof effect.scope === "object" ? effect.scope as Record<string, unknown> : undefined;
    if (scope) {
      return {
        type: "PUMP_GROUP_UNTIL_END_OF_TURN",
        controller: scope.controller ?? "SELF",
        filter: scope.filters,
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
      };
    }
    return {
      type: effect.duration === "END_OF_TURN" ? "PUMP_UNTIL_END_OF_TURN" : "PUMP",
      ...normalizeEffectTarget(effect.target),
      power: effect.power ?? 0,
      toughness: effect.toughness ?? 0,
    };
  }
  if (effect.type === "ADD_COUNTERS") {
    return {
      type: "PUT_COUNTER",
      ...normalizeEffectTarget(effect.target),
      counterType: effect.counter ?? effect.counterType ?? "+1/+1",
      amount: effect.amount ?? 1,
    };
  }
  if (effect.type === "SEQUENCE" && effect.customHandler === "fight_simultaneously") {
    const steps = Array.isArray(effect.steps) ? (effect.steps as EffectDefinition[]) : [];
    const first = steps[0];
    const second = steps[1];
    return {
      type: "FIGHT_SIMULTANEOUS",
      sourceRef: first?.source ?? second?.target,
      targetRef: first?.target ?? second?.source,
    };
  }
  if (effect.type === "SEQUENCE") {
    return {
      ...effect,
      effects: ((effect.effects as EffectDefinition[] | undefined) ?? [])
        .map((step) => normalizeEffect(step))
        .filter(Boolean),
    };
  }
  if (effect.type === "CHOOSE") {
    return {
      ...effect,
      options: ((effect.options as Array<Record<string, unknown>> | undefined) ?? []).map((option) => ({
        ...option,
        effects: ((option.effects as EffectDefinition[] | undefined) ?? [])
          .map((step) => normalizeEffect(step))
          .filter(Boolean),
      })),
    };
  }
  return effect;
}

function normalizeEffectTarget(target: unknown): Record<string, unknown> {
  if (target === "SELF") return { target: "SELF" };
  if (typeof target === "string") return { targetRef: target };
  return { target };
}

function normalizeSide(side?: string): Side {
  return side === "HORDE" || side === "horde" ? "horde" : "player";
}
