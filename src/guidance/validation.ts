import type { ContentCatalog } from "../content/ContentCatalog";
import type { ContentDeckRecord, ContentDefinitionRecord } from "../content/contracts";
import { STORED_ENERGY_CAP } from "../engine/EnergySystem";
import { MAX_PLAYER_LANDS } from "../engine/GameRules";
import { DEFAULT_PLAYER_DECK_LAND_COUNT } from "../engine/GameState";
import type { Phase, Side } from "../engine/GameTypes";
import { isTranslationKey } from "../i18n/translations";
import {
  GUIDED_CALLOUT_VISIBILITIES,
  GUIDED_INTENT_CONTEXTS,
  GUIDED_INTENT_KINDS,
  GUIDED_HIGHLIGHT_ROLES,
  GUIDED_LESSON_SCHEMA_VERSION,
  GUIDED_PRECONDITION_KINDS,
  GUIDED_RECEIPT_KINDS,
  GUIDED_SURFACE_ANCHORS,
  type GuidedCardAlias,
  type GuidedCardSpec,
  type GuidedIntentSpec,
  type GuidedLessonDefinition,
  type GuidedScenarioZones,
  type GuidedStep,
} from "./contracts";

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const ALIAS_PATTERN = /^[a-z][a-z0-9_]*$/u;
const PHASES = new Set<Phase>(["untap", "draw", "main", "combat", "end", "host"]);
const INTENT_KINDS = new Set<string>(GUIDED_INTENT_KINDS);
const CALLOUT_VISIBILITIES = new Set<string>(GUIDED_CALLOUT_VISIBILITIES);
const INTENT_CONTEXTS = new Set<string>(GUIDED_INTENT_CONTEXTS);
const HIGHLIGHT_ROLES = new Set<string>(GUIDED_HIGHLIGHT_ROLES);
const RECEIPT_KINDS = new Set<string>(GUIDED_RECEIPT_KINDS);
const SURFACE_ANCHORS = new Set<string>(GUIDED_SURFACE_ANCHORS);
const PRECONDITION_KINDS = new Set<string>(GUIDED_PRECONDITION_KINDS);
const ZONE_NAMES = new Set<string>(["archive", "hand", "field", "memory", "oblivion"]);

type ZoneKey = keyof GuidedScenarioZones;

const ZONE_SIDES: Readonly<Record<ZoneKey, Side>> = {
  openingDeal: "player",
  playerArchiveTopToBottom: "player",
  playerField: "player",
  playerMemory: "player",
  playerOblivion: "player",
  hostArchiveTopToBottom: "host",
  hostField: "host",
  hostMemory: "host",
  hostOblivion: "host",
};

const ARCHIVE_OR_HAND_ZONES = new Set<ZoneKey>([
  "openingDeal",
  "playerArchiveTopToBottom",
  "hostArchiveTopToBottom",
]);

export function validateGuidedLesson(
  definition: GuidedLessonDefinition,
  catalog: ContentCatalog,
): string[] {
  const problems: string[] = [];
  const lesson = definition as GuidedLessonDefinition & Record<string, unknown>;

  if (definition.schemaVersion !== GUIDED_LESSON_SCHEMA_VERSION) {
    problems.push(
      `Guided lesson "${String(definition.id)}" uses schema ${String(definition.schemaVersion)}; expected ${GUIDED_LESSON_SCHEMA_VERSION}.`,
    );
  }
  if (!ID_PATTERN.test(String(definition.id ?? ""))) problems.push("Guided lesson id is not a stable content id.");
  if (!isPositiveInteger(definition.revision)) problems.push(`Guided lesson "${definition.id}" requires a positive integer revision.`);
  if (definition.mode !== "required" && definition.mode !== "optional") {
    problems.push(`Guided lesson "${definition.id}" has unknown mode "${String(definition.mode)}".`);
  }
  if (containsFunction(lesson)) problems.push(`Guided lesson "${definition.id}" must be declarative and cannot contain functions.`);

  const playerDeck = exactDeck(catalog, definition.scenario?.playerDeckKey, "player", problems);
  const hostDeck = exactDeck(catalog, definition.scenario?.hostDeckKey, "host", problems);
  validateScenarioScalars(definition, problems);

  const cards = definition.cards && typeof definition.cards === "object" ? definition.cards : {};
  const cardRecords = validateCards(cards, catalog, problems);
  const aliasZones = validateZones(definition, cards, cardRecords, playerDeck, hostDeck, problems);
  validateCombat(definition, aliasZones, problems);
  validateSteps(definition, cards, problems);

  return problems;
}

export function assertGuidedLessonValid(
  definition: GuidedLessonDefinition,
  catalog: ContentCatalog,
): void {
  const problems = validateGuidedLesson(definition, catalog);
  if (problems.length > 0) {
    throw new Error(`Invalid guided lesson "${definition.id}":\n- ${problems.join("\n- ")}`);
  }
}

function exactDeck(
  catalog: ContentCatalog,
  key: string | undefined,
  side: Side,
  problems: string[],
): ContentDeckRecord | undefined {
  if (typeof key !== "string" || key.length === 0) {
    problems.push(`Guided scenario is missing its ${side} deck key.`);
    return undefined;
  }
  const deck = catalog.findDeck(key);
  if (!deck || deck.qualifiedDeckKey !== key) {
    problems.push(`Deck key "${key}" is not a registered qualified deck key.`);
    return undefined;
  }
  if (deck.deck.side !== side) {
    problems.push(`Deck "${key}" belongs to ${deck.deck.side}, not ${side}.`);
    return undefined;
  }
  return deck;
}

function validateScenarioScalars(definition: GuidedLessonDefinition, problems: string[]): void {
  const scenario = definition.scenario;
  if (!scenario || typeof scenario !== "object") {
    problems.push(`Guided lesson "${definition.id}" has no scenario recipe.`);
    return;
  }
  if (typeof scenario.seed !== "string" || !scenario.seed.trim()) problems.push("Guided scenario seed cannot be empty.");
  if (scenario.seed?.trim().toLowerCase() === "developer") problems.push('Guided scenarios cannot use the special "developer" seed.');
  if (!new Set(["easy", "normal", "hard"]).has(scenario.difficulty)) {
    problems.push(`Unknown guided scenario difficulty "${String(scenario.difficulty)}".`);
  }
  if (scenario.activeSide !== "player" && scenario.activeSide !== "host") {
    problems.push(`Unknown guided scenario active side "${String(scenario.activeSide)}".`);
  }
  if (!PHASES.has(scenario.phase)) problems.push(`Unknown guided scenario phase "${String(scenario.phase)}".`);
  validateInteger("turnNumber", scenario.turnNumber, 1, problems);
  validateInteger("hostTurnNumber", scenario.hostTurnNumber, 0, problems);
  validateInteger("setupTurnsTotal", scenario.setupTurnsTotal, 0, problems);
  validateInteger("setupTurnsRemaining", scenario.setupTurnsRemaining, 0, problems);
  if (Number.isInteger(scenario.setupTurnsTotal) && Number.isInteger(scenario.setupTurnsRemaining)
    && scenario.setupTurnsRemaining > scenario.setupTurnsTotal) {
    problems.push("setupTurnsRemaining cannot exceed setupTurnsTotal.");
  }
  validateInteger("mulligansTaken", scenario.mulligansTaken, 0, problems);
  if (typeof scenario.setupCompletePendingHost !== "boolean") problems.push("setupCompletePendingHost must be boolean.");
  if (typeof scenario.openingHandAccepted !== "boolean") problems.push("openingHandAccepted must be boolean.");
  if (!scenario.player || typeof scenario.player !== "object") {
    problems.push("Guided scenario requires exact player state.");
  } else {
    validateInteger("player.life", scenario.player.life, 1, problems);
    validateInteger("player.availableEnergy", scenario.player.availableEnergy, 0, problems);
    validateInteger("player.storedEnergy", scenario.player.storedEnergy, 0, problems, STORED_ENERGY_CAP);
    validateInteger("player.pendingStoredEnergy", scenario.player.pendingStoredEnergy, 0, problems, STORED_ENERGY_CAP);
    validateInteger("player.lifePaidThisTurn", scenario.player.lifePaidThisTurn, 0, problems);
    validateInteger("player.lifeLostThisTurn", scenario.player.lifeLostThisTurn, 0, problems);
    if (typeof scenario.player.energyActionUsedThisTurn !== "boolean") problems.push("player.energyActionUsedThisTurn must be boolean.");
    if ((scenario.player.storedEnergy ?? 0) + (scenario.player.pendingStoredEnergy ?? 0) > STORED_ENERGY_CAP) {
      problems.push(`Stored and pending Energy cannot exceed the Reserve cap of ${STORED_ENERGY_CAP}.`);
    }
  }
  if (!scenario.host || typeof scenario.host !== "object") {
    problems.push("Guided scenario requires exact Host state.");
  } else {
    validateInteger("host.poisonCounters", scenario.host.poisonCounters, 0, problems);
  }
}

function validateCards(
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>,
  catalog: ContentCatalog,
  problems: string[],
): Map<GuidedCardAlias, ContentDefinitionRecord> {
  const records = new Map<GuidedCardAlias, ContentDefinitionRecord>();
  for (const [alias, spec] of Object.entries(cards)) {
    if (!ALIAS_PATTERN.test(alias)) problems.push(`Card alias "${alias}" must use lower snake_case.`);
    if (!spec || typeof spec !== "object" || typeof spec.cardKey !== "string") {
      problems.push(`Card alias "${alias}" has no qualified card key.`);
      continue;
    }
    const record = catalog.findDefinitionRecord(spec.cardKey);
    if (!record || record.qualifiedCardKey !== spec.cardKey) {
      problems.push(`Card alias "${alias}" uses unknown or unqualified key "${spec.cardKey}".`);
      continue;
    }
    records.set(alias, record);
    validateCardState(alias, spec, problems);
  }
  return records;
}

function validateCardState(alias: string, spec: GuidedCardSpec, problems: string[]): void {
  const state = spec.state;
  if (!state) return;
  for (const key of ["exhausted", "stabilizing", "activatedThisTurn", "enteredThisTurn"] as const) {
    if (state[key] !== undefined && typeof state[key] !== "boolean") problems.push(`${alias}.${key} must be boolean.`);
  }
  if (state.damageMarked !== undefined) validateInteger(`${alias}.damageMarked`, state.damageMarked, 0, problems);
  if (state.attacksMade !== undefined) validateInteger(`${alias}.attacksMade`, state.attacksMade, 0, problems);
  for (const [counter, amount] of Object.entries(state.counters ?? {})) {
    if (!counter.trim()) problems.push(`Card alias "${alias}" has an empty counter name.`);
    validateInteger(`${alias}.counters.${counter}`, amount, 0, problems);
  }
}

function validateZones(
  definition: GuidedLessonDefinition,
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>,
  records: ReadonlyMap<GuidedCardAlias, ContentDefinitionRecord>,
  playerDeck: ContentDeckRecord | undefined,
  hostDeck: ContentDeckRecord | undefined,
  problems: string[],
): Map<GuidedCardAlias, ZoneKey> {
  const zones = definition.scenario?.zones;
  const aliasZones = new Map<GuidedCardAlias, ZoneKey>();
  if (!zones || typeof zones !== "object") {
    problems.push("Guided scenario requires every exact zone list.");
    return aliasZones;
  }

  const definitionCounts = new Map<string, number>();
  for (const zone of Object.keys(ZONE_SIDES) as ZoneKey[]) {
    const aliases = zones[zone];
    if (!Array.isArray(aliases)) {
      problems.push(`Guided scenario zone "${zone}" must be an array, even when empty.`);
      continue;
    }
    aliases.forEach((alias, index) => {
      if (typeof alias !== "string" || !ALIAS_PATTERN.test(alias)) {
        problems.push(`Invalid alias at ${zone}[${index}].`);
        return;
      }
      if (!(alias in cards)) {
        problems.push(`Zone ${zone} references undefined card alias "${alias}".`);
        return;
      }
      const previousZone = aliasZones.get(alias);
      if (previousZone) {
        problems.push(`Card alias "${alias}" appears in both ${previousZone} and ${zone}.`);
        return;
      }
      aliasZones.set(alias, zone);
      const record = records.get(alias);
      if (!record) return;
      const expectedDeck = ZONE_SIDES[zone] === "player" ? playerDeck : hostDeck;
      if (expectedDeck && record.qualifiedDeckKey !== expectedDeck.qualifiedDeckKey) {
        problems.push(`Card alias "${alias}" does not belong to ${expectedDeck.qualifiedDeckKey}.`);
      }
      const authoredAsDeckCard = expectedDeck?.deck.cards.some((card) => card.id === record.definition.id) ?? false;
      if (record.definition.isToken && !authoredAsDeckCard && ARCHIVE_OR_HAND_ZONES.has(zone)) {
        problems.push(`Token alias "${alias}" cannot start in ${zone}; it must be generated by rules or placed in a settled zone.`);
      }
      const countKey = `${record.qualifiedDeckKey}:${record.definition.id}`;
      definitionCounts.set(countKey, (definitionCounts.get(countKey) ?? 0) + 1);
    });
  }

  for (const alias of Object.keys(cards)) {
    if (!aliasZones.has(alias)) problems.push(`Card alias "${alias}" is defined but not placed in any zone.`);
  }

  const playerFieldSources = [...aliasZones.entries()].filter(([alias, zone]) =>
    zone === "playerField" && records.get(alias)?.definition.kinds?.includes("SOURCE")
  ).length;
  if (playerFieldSources > MAX_PLAYER_LANDS) {
    problems.push(`Recipe places ${playerFieldSources} Sources on the Field, but the cap is ${MAX_PLAYER_LANDS}.`);
  }

  for (const deck of [playerDeck, hostDeck]) {
    if (!deck) continue;
    for (const card of deck.deck.cards) {
      const count = definitionCounts.get(`${deck.qualifiedDeckKey}:${card.id}`) ?? 0;
      const authoredMaximum = card.quantity ?? 1;
      const maximum = deck.deck.side === "player" && card.kinds?.includes("SOURCE")
        ? Math.min(authoredMaximum, deck.deck.gameplayLandCount ?? DEFAULT_PLAYER_DECK_LAND_COUNT)
        : authoredMaximum;
      if (count > maximum) {
        problems.push(`Recipe uses ${count} copies of "${card.id}" from ${deck.qualifiedDeckKey}, but the deck contains ${maximum}.`);
      }
    }
  }
  return aliasZones;
}

function validateCombat(
  definition: GuidedLessonDefinition,
  aliasZones: ReadonlyMap<GuidedCardAlias, ZoneKey>,
  problems: string[],
): void {
  const combat = definition.scenario?.combat;
  if (!combat || typeof combat !== "object") {
    problems.push("Guided scenario requires exact combat arrays and blockers.");
    return;
  }
  validateCombatList("playerAttackers", combat.playerAttackers, "playerField", aliasZones, problems);
  validateCombatList("hostAttackers", combat.hostAttackers, "hostField", aliasZones, problems);
  if (!combat.blockers || typeof combat.blockers !== "object" || Array.isArray(combat.blockers)) {
    problems.push("Guided scenario combat.blockers must be an object.");
    return;
  }
  const hostAttackers = new Set(combat.hostAttackers ?? []);
  const usedBlockers = new Set<string>();
  for (const [attacker, blockers] of Object.entries(combat.blockers)) {
    if (!hostAttackers.has(attacker)) problems.push(`Block assignment references undeclared Host attacker "${attacker}".`);
    if (!Array.isArray(blockers)) {
      problems.push(`Block assignment for "${attacker}" must be an array.`);
      continue;
    }
    for (const blocker of blockers) {
      if (aliasZones.get(blocker) !== "playerField") problems.push(`Blocker "${blocker}" is not on the player Field.`);
      if (usedBlockers.has(blocker)) problems.push(`Blocker "${blocker}" is assigned more than once.`);
      usedBlockers.add(blocker);
    }
  }
}

function validateCombatList(
  label: string,
  aliases: readonly string[] | undefined,
  expectedZone: ZoneKey,
  aliasZones: ReadonlyMap<GuidedCardAlias, ZoneKey>,
  problems: string[],
): void {
  if (!Array.isArray(aliases)) {
    problems.push(`Guided scenario combat.${label} must be an array.`);
    return;
  }
  const seen = new Set<string>();
  for (const alias of aliases) {
    if (aliasZones.get(alias) !== expectedZone) problems.push(`${label} card "${alias}" is not in ${expectedZone}.`);
    if (seen.has(alias)) problems.push(`${label} contains duplicate alias "${alias}".`);
    seen.add(alias);
  }
}

function validateSteps(
  definition: GuidedLessonDefinition,
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>,
  problems: string[],
): void {
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    problems.push(`Guided lesson "${definition.id}" requires at least one step.`);
    return;
  }
  const steps = new Map<string, GuidedStep>();
  for (const step of definition.steps) {
    if (!ID_PATTERN.test(String(step.id ?? ""))) problems.push(`Guided step id "${String(step.id)}" is invalid.`);
    if (steps.has(step.id)) problems.push(`Guided lesson "${definition.id}" has duplicate step "${step.id}".`);
    steps.set(step.id, step);
    if (!isTranslationKey(String(step.copy?.titleKey))) problems.push(`Step "${step.id}" has unknown title translation key.`);
    if (!isTranslationKey(String(step.copy?.bodyKey))) problems.push(`Step "${step.id}" has unknown body translation key.`);
    if (step.callout !== undefined && !CALLOUT_VISIBILITIES.has(step.callout)) {
      problems.push(`Step "${step.id}" has unknown callout visibility "${String(step.callout)}".`);
    }
    if (!Array.isArray(step.highlights)) problems.push(`Step "${step.id}" highlights must be an array.`);
    for (const highlight of step.highlights ?? []) {
      if (highlight.role !== undefined && !HIGHLIGHT_ROLES.has(highlight.role)) {
        problems.push(`Step "${step.id}" uses unknown highlight role "${String(highlight.role)}".`);
      }
      if (highlight.kind === "card") validateAliasRef(step.id, highlight.alias, cards, problems);
      else if (highlight.kind === "surface") {
        if (!SURFACE_ANCHORS.has(highlight.anchor)) problems.push(`Step "${step.id}" uses unknown surface anchor "${highlight.anchor}".`);
      } else problems.push(`Step "${step.id}" has an unknown highlight kind.`);
    }
    validateStepPresentation(step, cards, problems);
    validatePreconditions(step, cards, problems);
    if (step.kind === "act") {
      if (step.highlights.length === 0) problems.push(`Act step "${step.id}" requires at least one highlight.`);
      if (!INTENT_KINDS.has(step.allowedIntent?.kind)) problems.push(`Step "${step.id}" has unknown intent kind.`);
      validateMatcherAliases(step.id, step.allowedIntent, cards, problems);
      validateIntentShape(step.id, step.allowedIntent, problems);
    } else if (step.kind === "observe") {
      if (step.expectedReceipt && !RECEIPT_KINDS.has(step.expectedReceipt.kind)) {
        problems.push(`Step "${step.id}" has unknown receipt kind.`);
      }
      validateMatcherAliases(step.id, step.expectedReceipt, cards, problems);
    } else if (step.kind !== "explain") {
      problems.push(`Step "${step.id}" has unknown kind "${String((step as GuidedStep).kind)}".`);
    }
  }

  if (!steps.has(definition.startStepId)) problems.push(`Start step "${definition.startStepId}" does not exist.`);
  for (const step of definition.steps) {
    if (step.nextStepId && !steps.has(step.nextStepId)) problems.push(`Step "${step.id}" points to missing step "${step.nextStepId}".`);
  }
  validateStepGraph(definition.startStepId, steps, problems);
}

function validateStepPresentation(
  step: GuidedStep,
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>,
  problems: string[],
): void {
  const presentation = step.presentation;
  if (presentation === undefined) return;
  if (presentation.kind !== "cardComparison") {
    problems.push(`Step "${step.id}" has an unknown presentation kind.`);
    return;
  }
  if (presentation.emphasis !== "energyCost") {
    problems.push(`Step "${step.id}" has an unknown card-comparison emphasis.`);
  }
  if (!Array.isArray(presentation.cardAliases) || presentation.cardAliases.length < 2 || presentation.cardAliases.length > 3) {
    problems.push(`Step "${step.id}" card comparison requires two or three aliases.`);
    return;
  }
  const seen = new Set<string>();
  for (const alias of presentation.cardAliases) {
    validateAliasRef(step.id, alias, cards, problems);
    if (seen.has(alias)) problems.push(`Step "${step.id}" card comparison repeats alias "${alias}".`);
    seen.add(alias);
  }
}

function validatePreconditions(
  step: GuidedStep,
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>,
  problems: string[],
): void {
  if (step.preconditions === undefined) return;
  if (!Array.isArray(step.preconditions)) {
    problems.push(`Step "${step.id}" preconditions must be an array.`);
    return;
  }
  for (const condition of step.preconditions) {
    if (!condition || typeof condition !== "object" || !PRECONDITION_KINDS.has(condition.kind)) {
      problems.push(`Step "${step.id}" has an unknown precondition kind.`);
      continue;
    }
    if (condition.kind === "card.inZone") {
      validateAliasRef(step.id, condition.cardAlias, cards, problems);
      if (condition.side !== "player" && condition.side !== "host") {
        problems.push(`Step "${step.id}" card.inZone requires a known side.`);
      }
      if (!ZONE_NAMES.has(condition.zone) || (condition.side === "host" && condition.zone === "hand")) {
        problems.push(`Step "${step.id}" card.inZone uses unavailable zone "${String(condition.zone)}".`);
      }
      continue;
    }
    if (condition.kind === "phase.is") {
      if (!PHASES.has(condition.phase)) problems.push(`Step "${step.id}" phase.is uses an unknown phase.`);
      continue;
    }
    if (condition.kind === "side.isActive") {
      if (condition.side !== "player" && condition.side !== "host") {
        problems.push(`Step "${step.id}" side.isActive requires a known side.`);
      }
      continue;
    }
    validateInteger(`Step "${step.id}" ${condition.kind}`, condition.amount, 0, problems);
    if (condition.kind === "energy.stored" && condition.amount > STORED_ENERGY_CAP) {
      problems.push(`Step "${step.id}" energy.stored cannot exceed ${STORED_ENERGY_CAP}.`);
    }
  }
}

function validateMatcherAliases(
  stepId: string,
  matcher: {
    cardAlias?: string;
    targetAlias?: string;
    targetAliases?: readonly string[];
    assignments?: readonly { blockerAlias: string; attackerAlias: string }[];
  } | undefined,
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>,
  problems: string[],
): void {
  if (!matcher) return;
  if (matcher.cardAlias) validateAliasRef(stepId, matcher.cardAlias, cards, problems);
  if (matcher.targetAlias) validateAliasRef(stepId, matcher.targetAlias, cards, problems);
  if (matcher.targetAliases !== undefined && !Array.isArray(matcher.targetAliases)) {
    problems.push(`Step "${stepId}" targetAliases must be an array.`);
  }
  for (const alias of Array.isArray(matcher.targetAliases) ? matcher.targetAliases : []) {
    validateAliasRef(stepId, alias, cards, problems);
  }
  if (matcher.assignments !== undefined && !Array.isArray(matcher.assignments)) {
    problems.push(`Step "${stepId}" assignments must be an array.`);
  }
  for (const assignment of Array.isArray(matcher.assignments) ? matcher.assignments : []) {
    if (!assignment || typeof assignment !== "object") {
      problems.push(`Step "${stepId}" contains a malformed block assignment.`);
      continue;
    }
    validateAliasRef(stepId, assignment.blockerAlias, cards, problems);
    validateAliasRef(stepId, assignment.attackerAlias, cards, problems);
  }
}

function validateIntentShape(
  stepId: string,
  intent: GuidedIntentSpec | undefined,
  problems: string[],
): void {
  if (!intent?.kind || !INTENT_KINDS.has(intent.kind)) return;
  const requireCard = [
    "card.inspect",
    "card.play",
    "source.recycle",
    "ability.activate",
    "discard.choose",
    "discard.confirm",
    "combat.toggleAttacker",
    "combat.assignBlocker",
  ].includes(intent.kind);
  if (requireCard && !intent.cardAlias) problems.push(`Step "${stepId}" intent "${intent.kind}" requires cardAlias.`);
  if (intent.kind === "ability.activate" && !intent.abilityId?.trim()) {
    problems.push(`Step "${stepId}" intent "ability.activate" requires abilityId.`);
  }

  const requiresContext = intent.kind.startsWith("target.") || intent.kind.startsWith("discard.");
  if (requiresContext && (!intent.context || !INTENT_CONTEXTS.has(intent.context))) {
    problems.push(`Step "${stepId}" intent "${intent.kind}" requires a known context.`);
  }
  if (intent.kind.startsWith("discard.") && intent.context !== "hand-limit") {
    problems.push(`Step "${stepId}" discard intent must use context "hand-limit".`);
  }
  if (intent.kind === "target.choose" && !intent.targetAlias) {
    problems.push(`Step "${stepId}" intent "target.choose" requires targetAlias.`);
  }
  if (intent.kind === "target.confirm" && !Array.isArray(intent.targetAliases)) {
    problems.push(`Step "${stepId}" intent "target.confirm" requires exact targetAliases.`);
  }
  if (intent.kind === "combat.assignBlocker" && !intent.targetAlias) {
    problems.push(`Step "${stepId}" intent "combat.assignBlocker" requires targetAlias.`);
  }
  if (["combat.toggleAttacker", "combat.assignBlocker"].includes(intent.kind) && typeof intent.selected !== "boolean") {
    problems.push(`Step "${stepId}" intent "${intent.kind}" requires the exact selected state.`);
  }
  if (["combat.selectAllAttackers", "combat.cancelAttackers", "combat.confirmArchiveAttack"].includes(intent.kind) && !Array.isArray(intent.targetAliases)) {
    problems.push(`Step "${stepId}" intent "${intent.kind}" requires exact targetAliases.`);
  }
  if (["combat.cancelBlocks", "combat.confirmDefense"].includes(intent.kind) && !Array.isArray(intent.assignments)) {
    problems.push(`Step "${stepId}" intent "${intent.kind}" requires exact assignments.`);
  }

  if (intent.targetAliases) {
    const uniqueTargets = new Set(intent.targetAliases);
    if (uniqueTargets.size !== intent.targetAliases.length) {
      problems.push(`Step "${stepId}" intent "${intent.kind}" repeats a target alias.`);
    }
  }
  if (intent.assignments) {
    const blockers = new Set<string>();
    for (const assignment of intent.assignments) {
      if (blockers.has(assignment.blockerAlias)) {
        problems.push(`Step "${stepId}" intent "${intent.kind}" assigns blocker "${assignment.blockerAlias}" more than once.`);
      }
      blockers.add(assignment.blockerAlias);
    }
  }
}

function validateAliasRef(
  stepId: string,
  alias: string,
  cards: Readonly<Record<GuidedCardAlias, GuidedCardSpec>>,
  problems: string[],
): void {
  if (!(alias in cards)) problems.push(`Step "${stepId}" references undefined card alias "${alias}".`);
}

function validateStepGraph(startStepId: string, steps: ReadonlyMap<string, GuidedStep>, problems: string[]): void {
  if (!steps.has(startStepId)) return;
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let current: string | undefined = startStepId;
  while (current) {
    if (visiting.has(current)) {
      problems.push(`Guided step graph contains a cycle at "${current}".`);
      break;
    }
    visiting.add(current);
    visited.add(current);
    const step = steps.get(current);
    current = step?.nextStepId;
  }
  for (const stepId of steps.keys()) {
    if (!visited.has(stepId)) problems.push(`Guided step "${stepId}" is unreachable from "${startStepId}".`);
  }
}

function validateInteger(label: string, value: number, minimum: number, problems: string[], maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    problems.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function containsFunction(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((nested) => containsFunction(nested, seen));
}
