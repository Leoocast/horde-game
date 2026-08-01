import { DECK_REGISTRY, findCardDefinition } from "./decks";
import type { NewDeckAbility, NewDeckCard, NewDeckList } from "./deckCatalog";
import { normalizeDeck } from "./normalizeDeck";
import { adaptHostfallDeck, HOSTFALL_DECK_SCHEMA_VERSION } from "./hostfallDeckAdapter";
import type { EffectDefinition } from "../engine/GameTypes";
import { isCardKind, isCardModifier, isTrait } from "../engine/hostfallVocabulary";
import { isHostfallAuthoredZone } from "../engine/hostfallZones";
import {
  AMOUNT_TYPES,
  AUTHORING_TRIGGER_EVENTS,
  EFFECT_CONDITION_TYPES,
  ENGINE_TRIGGER_EVENTS,
  RESOLVABLE_EFFECT_TYPES,
  STATIC_CONDITION_TYPES,
  TRIGGER_CONDITION_TYPES,
  isKnownCustomHandler,
} from "../engine/effectVocabulary";

export type DeckLintIssue = {
  deckId: string;
  cardId: string;
  abilityId: string;
  message: string;
};

export type CardLintStatus = "vanilla" | "ready" | "partial";

export type CardLintRow = {
  cardId: string;
  status: CardLintStatus;
  /** Ability ids marked engineSupport: "pending" — the WIP queue for this card. */
  pending: string[];
  /** Ability ids marked "ignored" or "custom" — intentional, not WIP. */
  intentional: string[];
};

export type DeckLintReport = {
  deckId: string;
  label: string;
  cards: CardLintRow[];
};

export function lintDecks(): { errors: DeckLintIssue[]; reports: DeckLintReport[] } {
  const errors: DeckLintIssue[] = [];
  const reports: DeckLintReport[] = [];

  for (const entry of DECK_REGISTRY) {
    const deckId = entry.deck.id;
    const report: DeckLintReport = { deckId, label: entry.label, cards: [] };
    lintHostfallSchema(entry.raw, errors);
    const compatibleDeck = adaptHostfallDeck(entry.raw);
    const authoredCards = [...compatibleDeck.cards, ...(compatibleDeck.tokens ?? [])];
    if (!authoredCards.some((card) => card.id === entry.presentation.keyCardId)) {
      errors.push({
        deckId,
        cardId: entry.presentation.keyCardId,
        abilityId: "presentation.keyCardId",
        message: `Deck presentation references unknown key card "${entry.presentation.keyCardId}".`,
      });
    }
    if (entry.deck.side === "horde" && !entry.presentation.encounterTone) {
      errors.push({
        deckId,
        cardId: entry.presentation.keyCardId,
        abilityId: "presentation.encounterTone",
        message: "Horde deck presentation must declare an encounter tone.",
      });
    }
    for (const card of authoredCards) {
      report.cards.push(lintCard(deckId, card, errors));
    }
    reports.push(report);
  }
  return { errors, reports };
}

const LEGACY_HOSTFALL_AUTHORING_KEYS = new Set([
  "cardTypes",
  "colorIdentity",
  "coloredMana",
  "colors",
  "damagePerMill",
  "entersTapped",
  "genericMana",
  "hordeCreaturesHaveHaste",
  "keywords",
  "mana",
  "manaCost",
  "manaValue",
  "permanentType",
  "poisonPerMill",
  "requiresNoSummoningSickness",
  "tap",
  "tapped",
  "toughness",
]);

const LEGACY_HOSTFALL_AUTHORING_VALUES = new Set([
  "ADD_MANA",
  "Artifact",
  "BATTLEFIELD",
  "Creature",
  "DEATHTOUCH",
  "Energy",
  "ENTERS_BATTLEFIELD",
  "Enchantment",
  "EXILE",
  "EXILE_CARD_FROM_GRAVEYARD",
  "FIRST_STRIKE",
  "GRAVEYARD",
  "GRAVEYARD_COUNT_AT_LEAST",
  "GRAVEYARD_HAS_TOKEN_CREATURE_AND_NON_TOKEN_CREATURE",
  "HASTE",
  "HORDE",
  "HORDE_DIRECTIVE_ONLY",
  "IGNORED_FOR_HORDE_MVP",
  "INSTANT",
  "Instant",
  "Land",
  "LIBRARY",
  "LIFESTEAL",
  "LOWEST_EXCESS_MANA_THEN_LOWEST_TAP_PRIORITY",
  "LOWEST_MANA_VALUE_THEN_RANDOM",
  "MENACE",
  "MILL_SELF",
  "PLAYER",
  "PLAYER_CHOOSES",
  "REACH",
  "SKULK",
  "SOURCE_IS_UNTAPPED",
  "TAP_HORDE_CREATURES_FOR_MANA",
  "SORCERY",
  "Sorcery",
  "TRAMPLE",
  "VIGILANCE",
  "WHILE_SOURCE_ON_BATTLEFIELD",
  "ANOTHER_CREATURE_YOU_CONTROL_DIED",
  "BEGIN_UPKEEP",
  "CARD_CAST",
  "CAST_CARD_IS_NON_TOKEN",
  "CREATURE_DIED",
  "COUNT_PERMANENTS",
  "COUNT_PERMANENTS_ENTERED_THIS_TURN",
  "DEAL_DAMAGE_TO_OPPONENT_CREATURE",
  "DEAL_DAMAGE_TO_RANDOM_OPPONENT_PERMANENT",
  "BEGIN_COMBAT",
  "PERMANENT_DIED",
  "REVEAL_HORDE_ROUND",
  "RETURN_SELF_FROM_GRAVEYARD_TO_BATTLEFIELD",
]);

export function lintHostfallDeckSchema(deck: NewDeckList): DeckLintIssue[] {
  const errors: DeckLintIssue[] = [];
  lintHostfallSchema(deck, errors);
  return errors;
}

function lintHostfallSchema(deck: NewDeckList, errors: DeckLintIssue[]): void {
  if (deck.schemaVersion !== HOSTFALL_DECK_SCHEMA_VERSION) {
    errors.push({
      deckId: deck.id,
      cardId: "(deck)",
      abilityId: "schema",
      message: `Unsupported schemaVersion "${String(deck.schemaVersion)}"; expected "${HOSTFALL_DECK_SCHEMA_VERSION}".`,
    });
    return;
  }
  if (deck.side !== "HOST" && deck.side !== "CHRONICLER") {
    errors.push({
      deckId: deck.id,
      cardId: "(deck)",
      abilityId: "schema",
      message: `Unknown side "${String(deck.side)}"; expected "HOST" or "CHRONICLER".`,
    });
  }

  const reportVocabulary = (
    values: unknown,
    cardId: string,
    path: string,
    label: string,
    predicate: (value: unknown) => boolean,
  ): void => {
    if (!Array.isArray(values)) {
      errors.push({ deckId: deck.id, cardId, abilityId: "schema", message: `${path} must be an array.` });
      return;
    }
    for (const value of values) {
      if (!predicate(value)) {
        errors.push({
          deckId: deck.id,
          cardId,
          abilityId: "schema",
          message: `Unknown Hostfall ${label} "${String(value)}" at "${path}".`,
        });
      }
    }
  };

  const visit = (value: unknown, cardId: string, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, cardId, `${path}[${index}]`));
      return;
    }
    if (typeof value === "string") {
      if (LEGACY_HOSTFALL_AUTHORING_VALUES.has(value) || /^TOXIC_\d+$/u.test(value) || /^toxic_\d+$/u.test(value)) {
        errors.push({
          deckId: deck.id,
          cardId,
          abilityId: "schema",
          message: `Hostfall schema cannot use legacy value "${value}" at "${path}".`,
        });
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === "kinds") reportVocabulary(nestedValue, cardId, nextPath, "kind", isCardKind);
      if (key === "modifiers") reportVocabulary(nestedValue, cardId, nextPath, "modifier", isCardModifier);
      if (key === "traits") reportVocabulary(nestedValue, cardId, nextPath, "trait", isTrait);
      if (key === "zone" && !isHostfallAuthoredZone(nestedValue)) {
        errors.push({
          deckId: deck.id,
          cardId,
          abilityId: "schema",
          message: `Unknown Hostfall zone "${String(nestedValue)}" at "${nextPath}".`,
        });
      }
      const parentType = String((value as Record<string, unknown>).type ?? "");
      if (key === "keyword" && parentType.includes("KEYWORD") && !isTrait(nestedValue)) {
        errors.push({
          deckId: deck.id,
          cardId,
          abilityId: "schema",
          message: `Unknown Hostfall trait "${String(nestedValue)}" at "${nextPath}".`,
        });
      }
      if (LEGACY_HOSTFALL_AUTHORING_KEYS.has(key)) {
        errors.push({
          deckId: deck.id,
          cardId,
          abilityId: "schema",
          message: `Hostfall schema cannot use legacy field "${nextPath}".`,
        });
      }
      visit(nestedValue, cardId, nextPath);
    }
  };

  for (const [key, value] of Object.entries(deck)) {
    if (key === "cards" || key === "tokens") continue;
    if (LEGACY_HOSTFALL_AUTHORING_KEYS.has(key)) {
      errors.push({ deckId: deck.id, cardId: "(deck)", abilityId: "schema", message: `Hostfall schema cannot use legacy field "deck.${key}".` });
    }
    visit(value, "(deck)", `deck.${key}`);
  }

  for (const card of [...deck.cards, ...(deck.tokens ?? [])]) {
    if (!Array.isArray(card.kinds) || card.kinds.length === 0) {
      errors.push({ deckId: deck.id, cardId: card.id, abilityId: "schema", message: "Hostfall cards must declare kinds[]." });
    }
    const amount = typeof card.energyCost === "number"
      ? card.energyCost
      : Number(card.energyCost?.amount);
    if (!Number.isInteger(amount) || amount < 0) {
      errors.push({ deckId: deck.id, cardId: card.id, abilityId: "schema", message: "energyCost.amount must be a non-negative integer." });
    }
    visit(card, card.id, "card");
  }
}

function lintCard(deckId: string, card: NewDeckCard, errors: DeckLintIssue[]): CardLintRow {
  const abilities = card.abilities ?? [];
  const pending: string[] = [];
  const intentional: string[] = [];

  abilities.forEach((ability, index) => {
    const abilityId = ability.id ?? `#${index}`;
    const flag = ability.engineSupport;
    if (flag === "pending") {
      pending.push(abilityId);
      return;
    }
    if (flag === "ignored" || flag === "custom") {
      intentional.push(abilityId);
      return;
    }
    if (flag !== undefined) {
      errors.push({ deckId, cardId: card.id, abilityId, message: `Unknown engineSupport value "${String(flag)}" (use pending/ignored/custom).` });
      return;
    }
    lintLiveAbility(deckId, card, ability, abilityId, errors);
  });

  const status: CardLintStatus = abilities.length === 0 ? "vanilla" : pending.length > 0 ? "partial" : "ready";
  return { cardId: card.id, status, pending, intentional };
}

function lintLiveAbility(deckId: string, card: NewDeckCard, ability: NewDeckAbility, abilityId: string, errors: DeckLintIssue[]): void {
  const report = (message: string) => errors.push({ deckId, cardId: card.id, abilityId, message });

  const kind = String(ability.kind ?? "");
  if (!["STATIC", "TRIGGERED", "ACTIVATED", "SPELL"].includes(kind)) {
    report(`Unknown ability kind "${kind}".`);
    return;
  }
  const customHandler = typeof ability.customHandler === "string" ? ability.customHandler : undefined;
  if (customHandler && !isKnownCustomHandler(customHandler)) {
    report(`Unknown customHandler "${customHandler}" — normalizeDeck would drop this ability silently. Implement it or mark the ability engineSupport: "pending".`);
    return;
  }
  if (kind === "TRIGGERED") {
    const event = String(ability.trigger?.event ?? "");
    if (!AUTHORING_TRIGGER_EVENTS.has(event)) {
      report(`Unknown trigger event "${event}".`);
      return;
    }
    for (const condition of ability.conditions ?? []) {
      const type = String(condition.type ?? "");
      // Conditions pass through to triggerConditionMet, which treats unknown types as
      // always-true — a silently wrong trigger, so the lint refuses them.
      if (!TRIGGER_CONDITION_TYPES.has(type)) report(`Unknown trigger condition "${type}".`);
    }
  }
  if (kind === "ACTIVATED" && (ability.effects ?? []).length > 1) {
    report(`Activated abilities support a single effect today; ${ability.effects?.length} declared (the rest would be dropped).`);
  }
  if (ability.requiresStabilized !== undefined && typeof ability.requiresStabilized !== "boolean") {
    report(`requiresStabilized must be boolean.`);
  }
  if (ability.cost?.life !== undefined) {
    const life = ability.cost.life;
    if (typeof life === "number") {
      if (!Number.isInteger(life) || life <= 0) {
        report(`Life cost must be a positive integer; received "${String(life)}".`);
      }
    } else if (
      !life
      || typeof life !== "object"
      || (life as Record<string, unknown>).type !== "CURRENT_LIFE_FRACTION"
      || !Number.isInteger((life as Record<string, unknown>).numerator)
      || Number((life as Record<string, unknown>).numerator) <= 0
      || !Number.isInteger((life as Record<string, unknown>).denominator)
      || Number((life as Record<string, unknown>).denominator) <= 0
      || !["UP", "DOWN"].includes(String((life as Record<string, unknown>).rounding))
    ) {
      report("Fractional life cost must declare CURRENT_LIFE_FRACTION with positive integer numerator/denominator and UP or DOWN rounding.");
    }
  }

  // Run the ability through the real pipeline, isolated on a synthetic one-ability card, and
  // inspect what actually reaches the engine. This catches every silent drop for real.
  const normalized = normalizeIsolated(card, ability);
  const produced =
    normalized.effects.length +
    normalized.activatedAbilities.length +
    normalized.requiresTargets.length +
    normalized.extraKeywords +
    (normalized.hasAdditionalCost ? 1 : 0);
  if (produced === 0) {
    report(`Ability produces nothing after normalization — it would silently not exist in game.`);
    return;
  }

  for (const effect of normalized.effects) validateEffectTree(effect, report, "effects");
  for (const activated of normalized.activatedAbilities) {
    validateEffectTree(activated.effect as EffectDefinition, report, "activated effect");
  }
  if (kind === "SPELL") validateSpellTargetRefs(normalized, report);
}

type NormalizedView = {
  effects: EffectDefinition[];
  activatedAbilities: Array<{ effect: unknown }>;
  requiresTargets: Array<{ id: string }>;
  extraKeywords: number;
  hasAdditionalCost: boolean;
};

function normalizeIsolated(card: NewDeckCard, ability: NewDeckAbility): NormalizedView {
  const syntheticDeck: NewDeckList = {
    id: "lint",
    name: "lint",
    side: "horde",
    cards: [{ ...card, abilities: [ability] }],
  };
  const definition = normalizeDeck(syntheticDeck).cards[0];
  const baseKeywords = card.keywords?.length ?? 0;
  return {
    effects: definition.effects ?? [],
    activatedAbilities: definition.activatedAbilities ?? [],
    requiresTargets: (definition.requiresTargets ?? []) as Array<{ id: string }>,
    extraKeywords: Math.max(0, (definition.keywords?.length ?? 0) - baseKeywords),
    hasAdditionalCost: Boolean(definition.additionalCost),
  };
}

function validateEffectTree(effect: EffectDefinition | undefined, report: (message: string) => void, path: string): void {
  if (!effect || typeof effect !== "object") return;
  const type = String(effect.type ?? "");
  if (!RESOLVABLE_EFFECT_TYPES.has(type)) {
    report(`Effect type "${type}" (${path}) is not implemented by the engine — it would silently do nothing.`);
    return;
  }
  if (type === "TRIGGERED_ABILITY") {
    const trigger = String(effect.trigger ?? "");
    if (!ENGINE_TRIGGER_EVENTS.has(trigger)) report(`Trigger "${trigger}" (${path}) is not an engine event.`);
    validateTriggerCondition(effect.condition, report, `${path}.condition`);
    validateEffectTree(effect.effect as EffectDefinition, report, `${path}.effect`);
    return;
  }
  if (type === "CONDITIONAL") {
    const conditionType = String((effect.condition as Record<string, unknown> | undefined)?.type ?? "");
    if (!EFFECT_CONDITION_TYPES.has(conditionType)) report(`Conditional effect condition "${conditionType}" (${path}) is unknown.`);
    validateEffectTree(effect.effect as EffectDefinition, report, `${path}.effect`);
    return;
  }
  if (type === "STATIC_CONDITIONAL_BUFF" || type === "STATIC_CONDITIONAL_GRANT_KEYWORD") {
    const conditionType = String((effect.condition as Record<string, unknown> | undefined)?.type ?? "");
    if (!STATIC_CONDITION_TYPES.has(conditionType)) report(`Static condition "${conditionType}" (${path}) is unknown.`);
    return;
  }
  if (type === "CREATE_TOKEN") {
    const tokenId = String(effect.tokenId ?? "");
    if (!findCardDefinition(tokenId)) report(`CREATE_TOKEN references unknown tokenId "${tokenId}" (${path}).`);
  }
  if (effect.amount && typeof effect.amount === "object") {
    const amountType = String((effect.amount as Record<string, unknown>).type ?? "");
    if (!AMOUNT_TYPES.has(amountType)) report(`Amount type "${amountType}" (${path}) is unknown.`);
  }
  if (type === "SEQUENCE") {
    const steps = Array.isArray(effect.effects) ? (effect.effects as EffectDefinition[]) : [];
    steps.forEach((step, index) => validateEffectTree(step, report, `${path}[${index}]`));
    return;
  }
  if (type === "CHOOSE") {
    const options = Array.isArray(effect.options) ? (effect.options as Array<Record<string, unknown>>) : [];
    options.forEach((option, optionIndex) => {
      const steps = Array.isArray(option.effects) ? (option.effects as EffectDefinition[]) : [];
      steps.forEach((step, index) => validateEffectTree(step, report, `${path}.option[${optionIndex}][${index}]`));
    });
  }
}

function validateTriggerCondition(condition: unknown, report: (message: string) => void, path: string): void {
  if (!condition || typeof condition !== "object") return;
  const data = condition as Record<string, unknown>;
  const type = String(data.type ?? "");
  if (!TRIGGER_CONDITION_TYPES.has(type)) {
    report(`Trigger condition "${type}" (${path}) is unknown — triggerConditionMet would treat it as always true.`);
    return;
  }
  if (type === "ALL_OF" && Array.isArray(data.conditions)) {
    data.conditions.forEach((item, index) => validateTriggerCondition(item, report, `${path}[${index}]`));
  }
}

/** Spells drive the targeting overlays through requiresTargets; every string ref inside the
 *  spell's effects must point at a declared target id (or SELF), or resolution finds nothing. */
function validateSpellTargetRefs(normalized: NormalizedView, report: (message: string) => void): void {
  const declared = new Set(normalized.requiresTargets.map((target) => target.id));
  for (const effect of normalized.effects) collectRefs(effect, declared, report, "effects");
}

function collectRefs(effect: EffectDefinition | undefined, declared: Set<string>, report: (message: string) => void, path: string): void {
  if (!effect || typeof effect !== "object") return;
  for (const key of ["target", "targetRef", "sourceRef", "source", "from"] as const) {
    const value = effect[key];
    if (typeof value === "string" && value !== "SELF" && !declared.has(value)) {
      report(`Effect ${String(effect.type)} (${path}) references target "${value}" which the spell never declares.`);
    }
  }
  if (Array.isArray(effect.effects)) {
    (effect.effects as EffectDefinition[]).forEach((step, index) => collectRefs(step, declared, report, `${path}[${index}]`));
  }
}
