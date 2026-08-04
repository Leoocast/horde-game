// The engine's card vocabulary, in one place. Deck lint validates every deck JSON against
// these sets so a typo or an unimplemented effect fails the test run instead of silently
// doing nothing at runtime (resolveEffect, triggerConditionMet and friends all fall through
// quietly on unknown types).
//
// Each set mirrors one concrete function. When you add a case there, add it here — the lint
// exists precisely to complain when the two drift apart.

import { registeredEffectTypes } from "./EffectResolver";

/** Derived directly from EffectResolver's handler registry — the registry keys ARE the
 *  vocabulary, so adding a handler there automatically makes the type legal in deck JSONs. */
export const RESOLVABLE_EFFECT_TYPES = registeredEffectTypes();

/** Events cards can react to. Mirrors what `enqueue` callers emit and what
 *  EffectResolver.triggeredSourcesForEvent / resolveTriggeredEvent dispatch on. */
export const ENGINE_TRIGGER_EVENTS = new Set([
  "INVOKED",
  "ECHO_INVOKED",
  "THIS_DIES",
  "ECHO_DIED",
  "CARD_PLAYED",
  "LIFE_PAID",
  "LIFE_LOST",
  "ATTACK_DECLARED",
  "BEGIN_BATTLE",
  "SURVIVED_DAMAGE",
]);

/** Authoring-level trigger events normalizeDeck.normalizeTriggerEvent knows how to map. */
export const AUTHORING_TRIGGER_EVENTS = new Set([
  "INVOKED",
  "THIS_DIES",
  "ECHO_DIED",
  "CARD_PLAYED",
  "LIFE_PAID",
  "LIFE_LOST",
  "ATTACK_DECLARED",
  "BEGIN_BATTLE",
  "BEGIN_READY",
  "SURVIVED_DAMAGE",
]);

/** Mirrors EffectResolver.triggerConditionMet (which returns true for unknown types —
 *  exactly the silent failure the lint guards against). */
export const TRIGGER_CONDITION_TYPES = new Set([
  "ALL_OF",
  "ACTIVE_PLAYER_IS",
  "FIRST_LIFE_PAYMENT_THIS_TURN",
  "FIRST_LIFE_LOSS_THIS_TURN",
  "SOURCE_IS_READY",
  "SOURCE_IS_ATTACKING",
  "SOURCE_ONCE_PER_TURN_UNUSED",
  "PLAYED_CARD_IS_NON_TOKEN",
  "ANOTHER_ALLIED_ECHO_DIED",
  "ANOTHER_ALLIED_ECHO_INVOKED",
  "EVENT_OBJECT_MATCHES",
]);

/** Mirrors EffectResolver.effectConditionMet (conditions inside a CONDITIONAL effect). */
export const EFFECT_CONDITION_TYPES = new Set([
  "ATTACK_TOTAL_POWER_AT_LEAST",
  "DECLARED_ATTACKER_MATCHES",
]);

/** Mirrors StaticEffects.staticConditionMet (conditions on STATIC_CONDITIONAL_* effects). */
export const STATIC_CONDITION_TYPES = new Set([
  "ACTIVE_PLAYER_IS",
  "MEMORY_COUNT_AT_LEAST",
]);

/** Mirrors EffectResolver.resolveNumericAmount / resolveDamageAmount for object amounts. */
export const AMOUNT_TYPES = new Set([
  "STAT",
  "COUNT_ECHOS",
  "COUNT_ECHOS_INVOKED_THIS_TURN",
]);

/** Mirrors the switch in normalizeDeck.normalizeCustomTriggeredEffect, including the
 *  `fight_simultaneously` effect-level handler. */
export const CUSTOM_HANDLERS = new Set([
  "summoner_of_the_ranks_inspect_top_if_echo",
  "all_against_one_small_attacker_damage",
  "varkas_linebreaker_begin_combat_token",
  "varkas_linebreaker_attack_buff",
  "marshal_of_the_wave_goblins_attack_token",
  "marshal_of_the_wave_damage_each_opponent",
  "varka_infernal_matriarch_enter_damage_all",
  "fight_simultaneously",
]);

export function isKnownCustomHandler(handler: string): boolean {
  return CUSTOM_HANDLERS.has(handler);
}
