import type { ActionCost, ActivatedAbility, CardDefinition, DeckList, EffectDefinition, Keyword, Side } from "../engine/GameTypes";
import type { NewDeckAbility, NewDeckCard, NewDeckList } from "./deckCatalog";
import { adaptHostfallDeck } from "./hostfallDeckAdapter";

export function normalizeDeck(rawDeck: NewDeckList): DeckList {
  const authoredDeck = adaptHostfallDeck(rawDeck);
  return {
    id: authoredDeck.id,
    name: authoredDeck.name,
    side: normalizeSide(authoredDeck.side),
    deckSize: authoredDeck.deckSize ?? authoredDeck.cards.reduce((total, card) => total + (card.quantity ?? 1), 0),
    gameplayLandCount: authoredDeck.gameplayLandCount,
    cards: authoredDeck.cards.map(normalizeCard),
    tokens: authoredDeck.tokens?.map(normalizeCard),
    rulesProfile: authoredDeck.rulesProfile,
  };
}

function normalizeCard(card: NewDeckCard): CardDefinition {
  // Abilities flagged with `engineSupport` (pending/ignored/custom) never reach the engine:
  // they stay in the JSON as data, deck lint reports them, and nothing half-runs.
  const abilities = (card.abilities ?? []).filter((ability) => !ability.engineSupport);
  return {
    id: card.id,
    name: card.name,
    displayNameEs: card.displayNameEs,
    gameText: card.gameText,
    quantity: card.quantity,
    isToken: Boolean(card.isToken),
    energyCost: normalizeEnergyCost(card.energyCost),
    cardTypes: card.cardTypes,
    modifiers: card.modifiers,
    subtypes: card.subtypes,
    power: card.power,
    toughness: card.toughness,
    triggerMessage: card.triggerMessage,
    entersExhausted: card.entersExhausted,
    entersWithCounters: card.entersWithCounters,
    flags: card.flags,
    attachTo: card.attachTo,
    variableCost: card.variableCost,
    requiresDistribution: card.requiresDistribution,
    keywords: normalizeKeywords(card),
    additionalCost: normalizeSpellCost(abilities),
    activatedAbilities: normalizeActivatedAbilities(abilities),
    effects: normalizeEffects(abilities),
    requiresTargets: normalizeTargets(abilities),
  };
}

function normalizeSpellCost(abilities: NewDeckAbility[]): ActionCost | undefined {
  const cost = abilities.find((ability) => ability.kind === "SPELL")?.cost;
  return cost && Object.keys(cost).length > 0 ? { ...cost } as ActionCost : undefined;
}

function normalizeKeywords(card: NewDeckCard): Keyword[] {
  return [...(card.keywords ?? [])];
}

function normalizeEnergyCost(value: NewDeckCard["energyCost"]): number {
  if (typeof value === "number") return Math.max(0, value);
  return Math.max(0, Number(value?.amount ?? 0));
}

function normalizeActivatedAbilities(abilities: NewDeckAbility[]): ActivatedAbility[] {
  return abilities
    .filter((ability) => ability.kind === "ACTIVATED")
    .map((ability) => {
      const firstEffect = ability.effects?.[0] as EffectDefinition | undefined;
      return {
        id: ability.id ?? "activated_ability",
        cost: ability.cost as ActionCost | undefined,
        requiresStabilized: ability.requiresStabilized,
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
    if (effect.type === "MODIFY_STATS" && effect.duration === "WHILE_SOURCE_ON_FIELD") {
      if (effect.condition) {
        normalized.push({
          type: "STATIC_CONDITIONAL_BUFF",
          condition: effect.condition,
          target: effect.target ?? "SELF",
          power: effect.power ?? 0,
          toughness: effect.toughness ?? 0,
        });
        continue;
      }
      normalized.push({
        type: "STATIC_BUFF",
        controller: scope?.controller ?? "SELF",
        filter: scope?.filters,
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
      });
      continue;
    }
    if (effect.type === "GRANT_KEYWORD" && effect.duration === "WHILE_SOURCE_ON_FIELD") {
      if (effect.condition) {
        normalized.push({
          type: "STATIC_CONDITIONAL_GRANT_KEYWORD",
          condition: effect.condition,
          target: effect.target ?? "SELF",
          keyword: effect.keyword,
        });
        continue;
      }
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
      type: String(req.filters && Array.isArray((req.filters as Record<string, unknown>).cardTypes) && ((req.filters as Record<string, unknown>).cardTypes as unknown[]).includes("ECHO") ? "TARGET_CREATURE" : "TARGET_PERMANENT"),
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
    case "rundvelt_hordemaster_inspect_top_if_goblin":
      return { type: "HORDE_INSPECT_TOP_GOBLIN" };
    case "raid_bombardment_small_attacker_damage":
      return {
        type: "DAMAGE_OPPONENT_FOR_EACH_DECLARED_ATTACKER_MATCHING",
        filter: { cardTypes: ["ECHO"], subtypes: ["Goblin"], maxPower: 2 },
        amount: 1,
        deferUntil: "HORDE_ATTACK_SEQUENCE_END",
        animation: "BURN_VOLLEY_TO_PLAYER",
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
          exhausted: true,
          attacking: true,
        },
      };
    case "general_kreat_damage_each_opponent":
      return { type: "DEAL_DAMAGE_TO_OPPONENT", amount: 1, animation: "BURN_TO_PLAYER" };
    case "goblin_chainwhirler_enter_damage_all":
      return { type: "DEAL_DAMAGE_TO_OPPONENT_AND_CREATURES", amount: 1, animation: "BURN_VOLLEY" };
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
  for (const condition of conditions) {
    if (condition.type === "ACTIVE_PLAYER_IS") {
      normalized.push({ type: "ACTIVE_PLAYER_IS", player: condition.player });
      continue;
    }
    if (condition.type === "EVENT_OBJECT_MATCHES") {
      const filters = condition.filters as { cardTypes?: import("../engine/hostfallVocabulary").CardKind[]; subtypes?: string[] } | undefined;
      if (condition.controller === "SELF" && condition.excludeSource && filters?.cardTypes?.includes("ECHO")) {
        normalized.push({ type: "ANOTHER_PERMANENT_YOU_CONTROL_ENTERED", filters });
      } else {
        normalized.push({
          type: "EVENT_OBJECT_MATCHES",
          controller: condition.controller,
          excludeSource: condition.excludeSource,
          filters,
        });
      }
      continue;
    }
    // Every other condition type is already written in the engine's own vocabulary
    // (CAST_CARD_IS_NON_TOKEN, ANOTHER_CREATURE_YOU_CONTROL_DIED, ...) and passes through
    // untouched; deck lint verifies the type is one triggerConditionMet actually knows.
    normalized.push({ ...condition } as EffectDefinition);
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
        animation: effect.animation,
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
