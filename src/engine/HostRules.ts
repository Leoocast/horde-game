import type { HostRulesProfile } from "./GameTypes";

/** Default Host rules, minus the Zombie-only surge bonus (that one lives in the Zombie deck's
 * JSON). Every Host deck starts from these and overrides via `rulesProfile`. */
export const DEFAULT_HOST_RULES: HostRulesProfile = {
  revealCount: 3,
  stopOnNonToken: true,
  miniSurgeTurn: 6,
  miniSurgeExtraReveals: 1,
  surgeTurn: 10,
  surgeTurnChaos: 8,
  surgeExtraReveals: 2,
  damagePerArchiveDiscard: 3,
  poisonPerArchiveDiscard: 3,
  hostEchosHaveImpetus: true,
  swarmTokenSubtypes: ["Zombie"],
};

export function buildHostRules(raw?: Record<string, unknown>): HostRulesProfile {
  if (!raw) return cloneDefaultHostRules();
  const rules: HostRulesProfile = {
    revealCount: readInteger(raw.revealCount, DEFAULT_HOST_RULES.revealCount, 1),
    stopOnNonToken: readBoolean(raw.stopOnNonToken, DEFAULT_HOST_RULES.stopOnNonToken),
    miniSurgeTurn: readInteger(raw.miniSurgeTurn, DEFAULT_HOST_RULES.miniSurgeTurn, 0),
    miniSurgeExtraReveals: readInteger(raw.miniSurgeExtraReveals, DEFAULT_HOST_RULES.miniSurgeExtraReveals, 0),
    surgeTurn: readInteger(raw.surgeTurn, DEFAULT_HOST_RULES.surgeTurn, 1),
    surgeTurnChaos: readInteger(raw.surgeTurnChaos, DEFAULT_HOST_RULES.surgeTurnChaos, 1),
    surgeExtraReveals: readInteger(raw.surgeExtraReveals, DEFAULT_HOST_RULES.surgeExtraReveals, 0),
    damagePerArchiveDiscard: readInteger(raw.damagePerArchiveDiscard, DEFAULT_HOST_RULES.damagePerArchiveDiscard, 1),
    poisonPerArchiveDiscard: readInteger(raw.poisonPerArchiveDiscard, DEFAULT_HOST_RULES.poisonPerArchiveDiscard, 1),
    hostEchosHaveImpetus: readBoolean(raw.hostEchosHaveImpetus, DEFAULT_HOST_RULES.hostEchosHaveImpetus),
    swarmTokenSubtypes: readStringArray(raw.swarmTokenSubtypes, DEFAULT_HOST_RULES.swarmTokenSubtypes),
  };
  const bonus = raw.surgeBonus as Record<string, unknown> | undefined;
  if (bonus && typeof bonus === "object" && !Array.isArray(bonus)) {
    rules.surgeBonus = {
      power: readFiniteNumber(bonus.power, 0),
      endurance: readFiniteNumber(bonus.endurance, 0),
      subtypes: readStringArray(bonus.subtypes, []),
    };
  }
  return rules;
}

function cloneDefaultHostRules(): HostRulesProfile {
  return {
    ...DEFAULT_HOST_RULES,
    swarmTokenSubtypes: [...DEFAULT_HOST_RULES.swarmTokenSubtypes],
    surgeBonus: DEFAULT_HOST_RULES.surgeBonus
      ? { ...DEFAULT_HOST_RULES.surgeBonus, subtypes: [...DEFAULT_HOST_RULES.surgeBonus.subtypes] }
      : undefined,
  };
}

function readInteger(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum ? value : fallback;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0)
    ? [...value]
    : [...fallback];
}
