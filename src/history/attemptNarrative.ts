export type NarrativeLanguage = "es" | "en";

export type AttemptOutcome = "victory" | "defeat" | "interrupted";

export interface LocalizedFactText {
  readonly es: string;
  readonly en: string;
}

interface AttemptMilestoneBase {
  readonly turnNumber?: number;
}

export interface FirstSurgeFieldMilestone extends AttemptMilestoneBase {
  readonly kind: "first-surge-field";
  readonly echoCount: number;
  readonly sourceCount: number;
}

export interface UnblockedAttackMilestone extends AttemptMilestoneBase {
  readonly kind: "unblocked-attack";
  readonly attackerCount: number;
  readonly totalDamage: number;
  readonly attackerName?: LocalizedFactText;
}

export interface DirectLifeLossMilestone extends AttemptMilestoneBase {
  readonly kind: "direct-life-loss";
  readonly amount: number;
  readonly sourceName?: LocalizedFactText;
}

export type MultiTargetEffect =
  | "damage"
  | "minus-one-counters"
  | "destroy"
  | "return";

export interface MultiTargetEffectMilestone extends AttemptMilestoneBase {
  readonly kind: "multi-target-effect";
  readonly sourceName: LocalizedFactText;
  readonly targetCount: number;
  readonly effect: MultiTargetEffect;
}

export interface HostArchiveThresholdMilestone extends AttemptMilestoneBase {
  readonly kind: "host-archive-threshold";
  readonly remainingEchoes: number;
}

export interface UnusedReserveMilestone extends AttemptMilestoneBase {
  readonly kind: "unused-reserve";
  readonly amount: number;
}

export type VictorySourceKind = "archive-attack" | "echo-effect" | "combat";

export interface VictorySourceMilestone extends AttemptMilestoneBase {
  readonly kind: "victory-source";
  readonly sourceKind: VictorySourceKind;
  readonly sourceName?: LocalizedFactText;
  readonly amount?: number;
}

export type CombatStreakAction = "won" | "defended";

export interface CombatStreakMilestone extends AttemptMilestoneBase {
  readonly kind: "combat-streak";
  readonly echoName: LocalizedFactText;
  readonly count: number;
  readonly action: CombatStreakAction;
}

export type AttemptMilestone =
  | FirstSurgeFieldMilestone
  | UnblockedAttackMilestone
  | DirectLifeLossMilestone
  | MultiTargetEffectMilestone
  | HostArchiveThresholdMilestone
  | UnusedReserveMilestone
  | VictorySourceMilestone
  | CombatStreakMilestone;

export type AttemptMilestoneKind = AttemptMilestone["kind"];

export interface AttemptFacts {
  readonly outcome: AttemptOutcome;
  readonly turnNumber?: number;
  readonly milestones: readonly AttemptMilestone[];
}

export interface SelectedAttemptMilestone {
  readonly kind: AttemptMilestoneKind;
  readonly sourceIndex: number;
}

export interface AttemptNarrativeSelection {
  readonly selectedMilestones: readonly SelectedAttemptMilestone[];
  readonly fallback: boolean;
}

export interface AttemptNarrative {
  readonly language: NarrativeLanguage;
  readonly outcome: AttemptOutcome;
  readonly turnNumber?: number;
  readonly paragraph: string;
  readonly marks: readonly string[];
  readonly selectedMilestones: readonly SelectedAttemptMilestone[];
  readonly fallback: boolean;
}

export const SUPPORTED_ATTEMPT_MILESTONE_KINDS = Object.freeze([
  "first-surge-field",
  "unblocked-attack",
  "direct-life-loss",
  "multi-target-effect",
  "host-archive-threshold",
  "unused-reserve",
  "victory-source",
  "combat-streak",
] as const satisfies readonly AttemptMilestoneKind[]);

export const MAX_ATTEMPT_NARRATIVE_PARAGRAPH_LENGTH = 320;
export const MAX_ATTEMPT_NARRATIVE_MARK_LENGTH = 180;
export const MAX_ATTEMPT_NARRATIVE_MARKS = 2;

const MAX_SELECTED_MILESTONES = 1 + MAX_ATTEMPT_NARRATIVE_MARKS;

const KIND_ORDER = new Map<AttemptMilestoneKind, number>(
  SUPPORTED_ATTEMPT_MILESTONE_KINDS.map((kind, index) => [kind, index]),
);

const BASE_PRIORITY: Readonly<
  Record<AttemptOutcome, Readonly<Record<AttemptMilestoneKind, number>>>
> = {
  victory: {
    "first-surge-field": 42,
    "unblocked-attack": 44,
    "direct-life-loss": 48,
    "multi-target-effect": 78,
    "host-archive-threshold": 74,
    "unused-reserve": -1,
    "victory-source": 100,
    "combat-streak": 64,
  },
  defeat: {
    "first-surge-field": 78,
    "unblocked-attack": 96,
    "direct-life-loss": 90,
    "multi-target-effect": 50,
    "host-archive-threshold": 46,
    "unused-reserve": -1,
    "victory-source": -1,
    "combat-streak": 40,
  },
  interrupted: {
    "first-surge-field": 80,
    "unblocked-attack": 50,
    "direct-life-loss": 54,
    "multi-target-effect": 66,
    "host-archive-threshold": 72,
    "unused-reserve": -1,
    "victory-source": -1,
    "combat-streak": 60,
  },
};

interface RankedMilestone {
  readonly milestone: AttemptMilestone;
  readonly sourceIndex: number;
  readonly score: number;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function isOptionalTurnNumber(value: unknown): value is number | undefined {
  return value === undefined || isPositiveInteger(value);
}

function isLocalizedFactText(value: unknown): value is LocalizedFactText {
  return (
    isRecord(value) &&
    typeof value.es === "string" &&
    value.es.trim().length > 0 &&
    typeof value.en === "string" &&
    value.en.trim().length > 0
  );
}

function isAttemptMilestone(value: unknown): value is AttemptMilestone {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (!isOptionalTurnNumber(value.turnNumber)) return false;

  switch (value.kind) {
    case "first-surge-field":
      return isNonNegativeInteger(value.echoCount) && isNonNegativeInteger(value.sourceCount);
    case "unblocked-attack":
      return (
        isPositiveInteger(value.attackerCount) &&
        isPositiveInteger(value.totalDamage) &&
        (value.attackerName === undefined || isLocalizedFactText(value.attackerName))
      );
    case "direct-life-loss":
      return (
        isPositiveInteger(value.amount) &&
        (value.sourceName === undefined || isLocalizedFactText(value.sourceName))
      );
    case "multi-target-effect":
      return (
        isLocalizedFactText(value.sourceName) &&
        isPositiveInteger(value.targetCount) &&
        (value.effect === "damage" ||
          value.effect === "minus-one-counters" ||
          value.effect === "destroy" ||
          value.effect === "return")
      );
    case "host-archive-threshold":
      return isNonNegativeInteger(value.remainingEchoes);
    case "unused-reserve":
      return isPositiveInteger(value.amount);
    case "victory-source":
      return (
        (value.sourceKind === "archive-attack" ||
          value.sourceKind === "echo-effect" ||
          value.sourceKind === "combat") &&
        (value.sourceName === undefined || isLocalizedFactText(value.sourceName)) &&
        (value.amount === undefined || isPositiveInteger(value.amount))
      );
    case "combat-streak":
      return (
        isLocalizedFactText(value.echoName) &&
        isPositiveInteger(value.count) &&
        (value.action === "won" || value.action === "defended")
      );
    default:
      return false;
  }
}

function milestoneMagnitude(milestone: AttemptMilestone): number {
  switch (milestone.kind) {
    case "first-surge-field":
      return milestone.echoCount === 0 ? 12 : Math.min(milestone.echoCount + milestone.sourceCount, 8);
    case "unblocked-attack":
      return Math.min(milestone.totalDamage, 18);
    case "direct-life-loss":
      return Math.min(milestone.amount, 18);
    case "multi-target-effect":
      return Math.min(milestone.targetCount * 2, 12);
    case "host-archive-threshold":
      return Math.max(0, 12 - Math.min(milestone.remainingEchoes, 12));
    case "unused-reserve":
      return Math.min(milestone.amount * 2, 10);
    case "victory-source":
      return milestone.amount === undefined ? 2 : Math.min(milestone.amount, 10);
    case "combat-streak":
      return Math.min(milestone.count * 2, 12);
  }
}

function isApplicableToOutcome(milestone: AttemptMilestone, outcome: AttemptOutcome): boolean {
  if (milestone.kind === "victory-source") return outcome === "victory";
  if (milestone.kind === "unused-reserve") return outcome === "defeat";
  return true;
}

export function selectAttemptNarrativeFacts(facts: AttemptFacts): AttemptNarrativeSelection {
  const ranked: RankedMilestone[] = [];

  facts.milestones.forEach((candidate: unknown, sourceIndex) => {
    if (!isAttemptMilestone(candidate) || !isApplicableToOutcome(candidate, facts.outcome)) return;

    const basePriority = BASE_PRIORITY[facts.outcome][candidate.kind];
    if (basePriority < 0) return;

    ranked.push({
      milestone: candidate,
      sourceIndex,
      score: basePriority + milestoneMagnitude(candidate),
    });
  });

  ranked.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    const kindDifference =
      (KIND_ORDER.get(left.milestone.kind) ?? Number.MAX_SAFE_INTEGER) -
      (KIND_ORDER.get(right.milestone.kind) ?? Number.MAX_SAFE_INTEGER);
    return kindDifference || left.sourceIndex - right.sourceIndex;
  });

  const selectedMilestones = ranked.slice(0, MAX_SELECTED_MILESTONES).map(({ milestone, sourceIndex }) =>
    Object.freeze({ kind: milestone.kind, sourceIndex }),
  );

  return Object.freeze({
    selectedMilestones: Object.freeze(selectedMilestones),
    fallback: selectedMilestones.length === 0,
  });
}

function localized(value: LocalizedFactText, language: NarrativeLanguage): string {
  return value[language].trim();
}

function plural(
  amount: number,
  singular: string,
  pluralForm: string,
): string {
  return amount === 1 ? singular : pluralForm;
}

function renderMilestone(milestone: AttemptMilestone, language: NarrativeLanguage): string {
  if (language === "es") {
    switch (milestone.kind) {
      case "first-surge-field":
        return `Cuando comenzó la primera Estampida, el Campo del Cronista albergaba ${milestone.echoCount} ${plural(milestone.echoCount, "Eco", "Ecos")} y ${milestone.sourceCount} ${plural(milestone.sourceCount, "Fuente", "Fuentes")}.`;
      case "unblocked-attack": {
        if (milestone.attackerName) {
          return `${localized(milestone.attackerName, language)} atravesó el Campo sin defensor e infligió ${milestone.totalDamage} de daño.`;
        }
        return `${milestone.attackerCount} ${plural(milestone.attackerCount, "atacante", "atacantes")} ${milestone.attackerCount === 1 ? "atravesó" : "atravesaron"} el Campo sin defensor ${milestone.attackerCount === 1 ? "e infligió" : "e infligieron"} ${milestone.totalDamage} de daño.`;
      }
      case "direct-life-loss": {
        return milestone.sourceName
          ? `${localized(milestone.sourceName, language)} arrancó ${milestone.amount} de Vida al Cronista.`
          : `El Cronista perdió ${milestone.amount} de Vida de una sola vez.`;
      }
      case "multi-target-effect": {
        const source = localized(milestone.sourceName, language);
        switch (milestone.effect) {
          case "damage":
            return `${source} hizo daño a ${milestone.targetCount} objetivos.`;
          case "minus-one-counters":
            return `${source} puso contadores -1/-1 sobre ${milestone.targetCount} objetivos.`;
          case "destroy":
            return `${source} destruyó ${milestone.targetCount} objetivos.`;
          case "return":
            return `${source} devolvió ${milestone.targetCount} objetivos.`;
        }
      }
      case "host-archive-threshold":
        return `El Archivo de la Hueste llegó a quedarse con apenas ${milestone.remainingEchoes} ${plural(milestone.remainingEchoes, "Eco", "Ecos")}.`;
      case "unused-reserve":
        return `La derrota terminó con ${milestone.amount} de Energía sin usar en la Reserva.`;
      case "victory-source": {
        if (milestone.sourceKind === "archive-attack") {
          const source = milestone.sourceName
            ? `un ataque de ${localized(milestone.sourceName, language)}`
            : "el último ataque al Archivo de la Hueste";
          return `La fuente directa del cierre victorioso fue ${source}.`;
        }
        const source = milestone.sourceName
          ? localized(milestone.sourceName, language)
          : milestone.sourceKind === "echo-effect"
            ? "el último efecto de un Eco"
            : "el último combate";
        const amount = milestone.amount === undefined ? "" : ` por ${milestone.amount}`;
        return `La fuente directa del cierre victorioso fue ${source}${amount}.`;
      }
      case "combat-streak": {
        const name = localized(milestone.echoName, language);
        const verb = milestone.action === "won" ? "se impuso en" : "resistió";
        return `${name} ${verb} ${milestone.count} ${plural(milestone.count, "combate", "combates")}.`;
      }
    }
  }

  switch (milestone.kind) {
    case "first-surge-field":
      return `When the first Surge began, the Chronicler Field held ${milestone.echoCount} ${plural(milestone.echoCount, "Echo", "Echoes")} and ${milestone.sourceCount} ${plural(milestone.sourceCount, "Source", "Sources")}.`;
    case "unblocked-attack": {
      if (milestone.attackerName) {
        return `${localized(milestone.attackerName, language)} crossed the Field unblocked and dealt ${milestone.totalDamage} damage.`;
      }
      return `${milestone.attackerCount} ${plural(milestone.attackerCount, "attacker", "attackers")} crossed the Field unblocked and dealt ${milestone.totalDamage} damage.`;
    }
    case "direct-life-loss": {
      return milestone.sourceName
        ? `${localized(milestone.sourceName, language)} tore ${milestone.amount} Life from the Chronicler.`
        : `The Chronicler lost ${milestone.amount} Life in a single blow.`;
    }
    case "multi-target-effect": {
      const source = localized(milestone.sourceName, language);
      switch (milestone.effect) {
        case "damage":
          return `${source} dealt damage to ${milestone.targetCount} targets.`;
        case "minus-one-counters":
          return `${source} put -1/-1 counters on ${milestone.targetCount} targets.`;
        case "destroy":
          return `${source} destroyed ${milestone.targetCount} targets.`;
        case "return":
          return `${source} returned ${milestone.targetCount} targets.`;
      }
    }
    case "host-archive-threshold":
      return `The Host Archive dwindled to just ${milestone.remainingEchoes} ${plural(milestone.remainingEchoes, "Echo", "Echoes")}.`;
    case "unused-reserve":
      return `The defeat ended with ${milestone.amount} unspent Energy in Reserve.`;
    case "victory-source": {
      if (milestone.sourceKind === "archive-attack") {
        const source = milestone.sourceName
          ? `an attack by ${localized(milestone.sourceName, language)}`
          : "the final attack on the Host Archive";
        return `The direct source of the victorious close was ${source}.`;
      }
      const source = milestone.sourceName
        ? localized(milestone.sourceName, language)
        : milestone.sourceKind === "echo-effect"
          ? "the final Echo effect"
          : "the final combat";
      const amount = milestone.amount === undefined ? "" : ` for ${milestone.amount}`;
      return `The direct source of the victorious close was ${source}${amount}.`;
    }
    case "combat-streak": {
      const name = localized(milestone.echoName, language);
      const verb = milestone.action === "won" ? "prevailed through" : "held through";
      return `${name} ${verb} ${milestone.count} ${plural(milestone.count, "combat", "combats")}.`;
    }
  }
}

function renderNarrativeFallback(
  outcome: AttemptOutcome,
  language: NarrativeLanguage,
): string {
  if (language === "es") {
    if (outcome === "interrupted") return "La historia de este Futuro quedó inconclusa.";
    if (outcome === "victory") {
      return "Este Futuro fue preservado sin dejar un único momento para la Crónica.";
    }
    return "Este Futuro se desvaneció sin dejar un momento para la Crónica.";
  }

  if (outcome === "interrupted") return "The story of this Future remained unfinished.";
  if (outcome === "victory") {
    return "This Future was preserved without leaving a single moment for the Chronicle.";
  }
  return "This Future faded without leaving a moment for the Chronicle.";
}

function truncateAtBoundary(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  const availableLength = maximumLength - 1;
  const candidate = value.slice(0, availableLength);
  const lastSpace = candidate.lastIndexOf(" ");
  const cutAt = lastSpace >= Math.floor(availableLength * 0.7) ? lastSpace : availableLength;
  return `${candidate.slice(0, cutAt).trimEnd()}…`;
}

function milestoneAt(
  facts: AttemptFacts,
  selection: SelectedAttemptMilestone,
): AttemptMilestone | undefined {
  const candidate: unknown = facts.milestones[selection.sourceIndex];
  if (!isAttemptMilestone(candidate) || candidate.kind !== selection.kind) return undefined;
  if (!isApplicableToOutcome(candidate, facts.outcome)) return undefined;
  return candidate;
}

export function renderAttemptNarrative(
  facts: AttemptFacts,
  selection: AttemptNarrativeSelection,
  language: NarrativeLanguage,
): AttemptNarrative {
  const selected = selection.selectedMilestones
    .map((item) => ({ item, milestone: milestoneAt(facts, item) }))
    .filter(
      (entry): entry is { item: SelectedAttemptMilestone; milestone: AttemptMilestone } =>
        entry.milestone !== undefined,
    );
  const lead = selected[0]?.milestone;
  const paragraph = truncateAtBoundary(
    lead
      ? renderMilestone(lead, language)
      : renderNarrativeFallback(facts.outcome, language),
    MAX_ATTEMPT_NARRATIVE_PARAGRAPH_LENGTH,
  );
  const marks = selected
    .slice(1, 1 + MAX_ATTEMPT_NARRATIVE_MARKS)
    .map(({ milestone }) =>
      truncateAtBoundary(renderMilestone(milestone, language), MAX_ATTEMPT_NARRATIVE_MARK_LENGTH),
    );
  const selectedMilestones = selected.map(({ item }) => item);

  return Object.freeze({
    language,
    outcome: facts.outcome,
    ...(facts.turnNumber === undefined ? {} : { turnNumber: facts.turnNumber }),
    paragraph,
    marks: Object.freeze(marks),
    selectedMilestones: Object.freeze(selectedMilestones),
    fallback: selectedMilestones.length === 0,
  });
}

export function summarizeAttempt(
  facts: AttemptFacts,
  language: NarrativeLanguage,
): AttemptNarrative {
  return renderAttemptNarrative(facts, selectAttemptNarrativeFacts(facts), language);
}
