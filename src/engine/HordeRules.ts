import type { HordeRulesProfile } from "./GameTypes";

/** The classic Zombie-mode rules, minus the Zombie-only surge bonus (that one lives in the
 *  zombie deck's JSON). Every horde deck starts from these and overrides via `rulesProfile`. */
export const DEFAULT_HORDE_RULES: HordeRulesProfile = {
  revealCount: 3,
  stopOnNonToken: true,
  miniSurgeTurn: 6,
  miniSurgeExtraReveals: 1,
  surgeTurn: 10,
  surgeTurnChaos: 8,
  surgeExtraReveals: 2,
  damagePerMill: 3,
  poisonPerMill: 3,
  hordeCreaturesHaveHaste: true,
  swarmTokenSubtypes: ["Zombie", "Goblin"],
};

export function buildHordeRules(raw?: Record<string, unknown>): HordeRulesProfile {
  if (!raw) return { ...DEFAULT_HORDE_RULES };
  const rules: HordeRulesProfile = {
    revealCount: readNumber(raw.revealCount, DEFAULT_HORDE_RULES.revealCount),
    stopOnNonToken: readBoolean(raw.stopOnNonToken, DEFAULT_HORDE_RULES.stopOnNonToken),
    miniSurgeTurn: readNumber(raw.miniSurgeTurn, DEFAULT_HORDE_RULES.miniSurgeTurn),
    miniSurgeExtraReveals: readNumber(raw.miniSurgeExtraReveals, DEFAULT_HORDE_RULES.miniSurgeExtraReveals),
    surgeTurn: readNumber(raw.surgeTurn, DEFAULT_HORDE_RULES.surgeTurn),
    surgeTurnChaos: readNumber(raw.surgeTurnChaos, DEFAULT_HORDE_RULES.surgeTurnChaos),
    surgeExtraReveals: readNumber(raw.surgeExtraReveals, DEFAULT_HORDE_RULES.surgeExtraReveals),
    damagePerMill: readNumber(raw.damagePerMill, DEFAULT_HORDE_RULES.damagePerMill),
    poisonPerMill: readNumber(raw.poisonPerMill, DEFAULT_HORDE_RULES.poisonPerMill),
    hordeCreaturesHaveHaste: readBoolean(raw.hordeCreaturesHaveHaste, DEFAULT_HORDE_RULES.hordeCreaturesHaveHaste),
    swarmTokenSubtypes: readStringArray(raw.swarmTokenSubtypes, DEFAULT_HORDE_RULES.swarmTokenSubtypes),
  };
  const bonus = raw.surgeBonus as Record<string, unknown> | undefined;
  if (bonus && typeof bonus === "object") {
    rules.surgeBonus = {
      power: readNumber(bonus.power, 0),
      toughness: readNumber(bonus.toughness, 0),
      subtypes: readStringArray(bonus.subtypes, []),
    };
  }
  return rules;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.map(String) : [...fallback];
}
