import type { SfxId } from "../audio/soundManifest";
import type { CardFilter, CardInstance, GameState } from "../engine/GameTypes";
import { matchesFilter } from "../engine/StaticEffects";

export type CardVoiceCue = {
  sfx: SfxId;
};

export type CardVoiceCueMatch = {
  cardId: string;
  cue: CardVoiceCue;
};

export type CardVoiceEvent =
  | {
      type: "ENTERS_BATTLEFIELD";
      card: CardInstance;
      previousGame: GameState;
    }
  | {
      type: "ATTACKS";
      card: CardInstance;
      attackNumber: number;
    }
  | {
      type: "BLOCKS";
      card: CardInstance;
    };

type CardVoiceRule = {
  id: string;
  sourceDefinitionId: string;
  event: CardVoiceEvent["type"];
  subject: "SOURCE" | "ALLY";
  eventFilter?: CardFilter;
  occurrence?: number;
  speakChance?: number;
  maxPerBatch?: number;
  cues: readonly CardVoiceCue[];
};

/** Presentation-only card interactions. Adding a future voice relationship should be data here:
 * the matching code stays generic across definitions, creature types and combat events. */
export const CARD_VOICE_RULES: readonly CardVoiceRule[] = [
  {
    id: "countess-enters",
    sourceDefinitionId: "eternal_feast_countess",
    event: "ENTERS_BATTLEFIELD",
    subject: "SOURCE",
    cues: [{ sfx: "countessEnter" }],
  },
  {
    id: "countess-sees-human",
    sourceDefinitionId: "eternal_feast_countess",
    event: "ENTERS_BATTLEFIELD",
    subject: "ALLY",
    eventFilter: { cardTypes: ["ECHO"], subtypes: ["Human"] },
    cues: [{ sfx: "countessHumans" }],
  },
  {
    id: "countess-third-attack",
    sourceDefinitionId: "eternal_feast_countess",
    event: "ATTACKS",
    subject: "SOURCE",
    occurrence: 3,
    maxPerBatch: 1,
    cues: [{ sfx: "countessThirdAttack" }],
  },
  {
    id: "countess-defends",
    sourceDefinitionId: "eternal_feast_countess",
    event: "BLOCKS",
    subject: "SOURCE",
    speakChance: 0.5,
    cues: [
      { sfx: "countessPour" },
      { sfx: "countessWeak" },
    ],
  },
];

export function resolveCardVoiceCue(
  event: CardVoiceEvent,
  random: () => number = Math.random,
): CardVoiceCue | undefined {
  return resolveCardVoiceRule(event, random)?.cue;
}

export function resolveCardVoiceCueBatch(
  events: readonly CardVoiceEvent[],
  random: () => number = Math.random,
): CardVoiceCueMatch[] {
  const ruleUseCounts = new Map<string, number>();
  const matches: CardVoiceCueMatch[] = [];
  for (const event of events) {
    const resolved = resolveCardVoiceRule(event, random);
    if (!resolved) continue;
    const useCount = ruleUseCounts.get(resolved.rule.id) ?? 0;
    if (resolved.rule.maxPerBatch !== undefined && useCount >= resolved.rule.maxPerBatch) continue;
    ruleUseCounts.set(resolved.rule.id, useCount + 1);
    matches.push({ cardId: event.card.instanceId, cue: resolved.cue });
  }
  return matches;
}

function resolveCardVoiceRule(
  event: CardVoiceEvent,
  random: () => number,
): { rule: CardVoiceRule; cue: CardVoiceCue } | undefined {
  for (const rule of CARD_VOICE_RULES) {
    if (rule.event !== event.type) continue;
    const source = interactionSource(rule, event);
    if (!source) continue;
    if (!matchesFilter(event.card, rule.eventFilter, source)) continue;
    if (rule.occurrence !== undefined) {
      if (event.type !== "ATTACKS" || event.attackNumber !== rule.occurrence) continue;
    }

    const speakChance = rule.speakChance ?? 1;
    if (speakChance < 1 && normalizedRandom(random()) >= speakChance) return undefined;
    if (rule.cues.length === 1) return { rule, cue: rule.cues[0] };
    const cueIndex = Math.floor(normalizedRandom(random()) * rule.cues.length);
    return { rule, cue: rule.cues[cueIndex] };
  }
  return undefined;
}

function interactionSource(rule: CardVoiceRule, event: CardVoiceEvent): CardInstance | undefined {
  if (rule.subject === "SOURCE") {
    return event.card.definitionId === rule.sourceDefinitionId ? event.card : undefined;
  }
  if (event.type !== "ENTERS_BATTLEFIELD") return undefined;
  return event.previousGame[event.card.controller].field.find(
    (candidate) =>
      candidate.definitionId === rule.sourceDefinitionId &&
      candidate.instanceId !== event.card.instanceId,
  );
}

function normalizedRandom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 0.999999));
}
