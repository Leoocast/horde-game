// The engine's card vocabulary, in one place. Deck lint validates every deck JSON against
// these sets so a typo or an unimplemented effect fails the test run instead of silently
// doing nothing at runtime (resolveEffect, triggerConditionMet and friends all fall through
// quietly on unknown types).
//
// Each set mirrors one concrete function. When you add a case there, add it here — the lint
// exists precisely to complain when the two drift apart.

/** Mirrors the if-chain in EffectResolver.resolveEffect, plus the wrapper/static types it
 *  deliberately skips (they are consumed by StaticEffects/Keywords/resolveTriggeredEvent),
 *  plus ADD_MANA_DYNAMIC which only ManaSystem.getAutomaticMana understands. */
export const RESOLVABLE_EFFECT_TYPES = new Set([
  "TRIGGERED_ABILITY",
  "STATIC_BUFF",
  "STATIC_GRANT_KEYWORD",
  "STATIC_CONDITIONAL_BUFF",
  "STATIC_CONDITIONAL_GRANT_KEYWORD",
  "SEQUENCE",
  "CONDITIONAL",
  "CHOOSE",
  "HORDE_EXILE_TOP_GOBLIN_TO_BATTLEFIELD",
  "ADD_MANA",
  "ADD_MANA_DYNAMIC",
  "DRAW_CARD",
  "CREATE_TOKEN",
  "DEAL_DAMAGE_TO_OPPONENT",
  "DEAL_DAMAGE_TO_RANDOM_OPPONENT_PERMANENT",
  "DEAL_DAMAGE_TO_OPPONENT_AND_CREATURES",
  "DEAL_DAMAGE_TO_OPPONENT_CREATURE",
  "DAMAGE_OPPONENT_FOR_EACH_DECLARED_ATTACKER_MATCHING",
  "PUMP_SELF_PER_ATTACKER_MATCHING",
  "PUMP_GROUP_UNTIL_END_OF_TURN",
  "PUT_COUNTER",
  "REMOVE_COUNTER",
  "GAIN_LIFE",
  "PUMP_UNTIL_END_OF_TURN",
  "GRANT_KEYWORD_UNTIL_END_OF_TURN",
  "DEAL_DAMAGE_FROM_SOURCE_POWER",
  "DEAL_DAMAGE",
  "FIGHT_SIMULTANEOUS",
  "DESTROY",
  "DESTROY_TARGET",
  "DISTRIBUTE_COUNTERS",
  "DOUBLE_COUNTERS_ON_TARGETS",
  "MILL_SELF",
  "MILL_HORDE",
  "EACH_OPPONENT_DISCARDS",
  "EACH_OPPONENT_LOSES_LIFE",
]);

/** Events cards can react to. Mirrors what `enqueue` callers emit and what
 *  EffectResolver.triggeredSourcesForEvent / resolveTriggeredEvent dispatch on. */
export const ENGINE_TRIGGER_EVENTS = new Set([
  "ENTERS_BATTLEFIELD",
  "CREATURE_ENTERS_BATTLEFIELD",
  "THIS_DIES",
  "CREATURE_DIED",
  "CARD_CAST",
  "ATTACK_DECLARED",
  "BEGIN_COMBAT",
]);

/** Authoring-level trigger events normalizeDeck.normalizeTriggerEvent knows how to map. */
export const AUTHORING_TRIGGER_EVENTS = new Set([
  ...ENGINE_TRIGGER_EVENTS,
  "PERMANENT_DIED",
]);

/** Mirrors EffectResolver.triggerConditionMet (which returns true for unknown types —
 *  exactly the silent failure the lint guards against). */
export const TRIGGER_CONDITION_TYPES = new Set([
  "ALL_OF",
  "ACTIVE_PLAYER_IS",
  "SOURCE_IS_ATTACKING",
  "CAST_CARD_IS_NON_TOKEN",
  "ANOTHER_CREATURE_YOU_CONTROL_DIED",
  "ANOTHER_CREATURE_YOU_CONTROL_ENTERED",
  "ANOTHER_PERMANENT_YOU_CONTROL_ENTERED",
  "EVENT_OBJECT_MATCHES",
  "CONTROL_ANOTHER_PERMANENT_MATCHING",
]);

/** Mirrors EffectResolver.effectConditionMet (conditions inside a CONDITIONAL effect). */
export const EFFECT_CONDITION_TYPES = new Set([
  "ATTACK_TOTAL_POWER_AT_LEAST",
  "DECLARED_ATTACKER_MATCHES",
]);

/** Mirrors StaticEffects.staticConditionMet (conditions on STATIC_CONDITIONAL_* effects). */
export const STATIC_CONDITION_TYPES = new Set([
  "GRAVEYARD_COUNT_AT_LEAST",
]);

/** Mirrors EffectResolver.resolveNumericAmount / resolveDamageAmount for object amounts. */
export const AMOUNT_TYPES = new Set([
  "STAT",
  "COUNT_PERMANENTS",
]);

/** Mirrors the switch in normalizeDeck.normalizeCustomTriggeredEffect, plus the
 *  `toxic_N` static pattern and the `fight_simultaneously` effect-level handler. */
export const CUSTOM_HANDLERS = new Set([
  "rundvelt_hordemaster_exile_top_if_goblin",
  "battle_cry_goblin_pack_tactics",
  "raid_bombardment_small_attacker_damage",
  "goblin_rabblemaster_begin_combat_token",
  "goblin_rabblemaster_attack_buff",
  "general_kreat_goblins_attack_token",
  "general_kreat_damage_each_opponent",
  "goblin_chainwhirler_enter_damage_all",
  "fight_simultaneously",
]);

export function isKnownCustomHandler(handler: string): boolean {
  return CUSTOM_HANDLERS.has(handler) || /^toxic_\d+$/i.test(handler);
}
