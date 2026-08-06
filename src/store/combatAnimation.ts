import type { CardInstance } from "../engine/GameTypes";

export type PersonalCombatAnimationPreset = "emerald-fireball" | "infernal-fireball";
export type PersonalCombatRole = "attacker" | "defender";
export type PersonalCombatOutcome = "wins" | "loses" | "draws" | "survives";

export type PersonalCombatAnimationContext = {
  attacker: CardInstance;
  defender?: CardInstance;
  attackerDies: boolean;
  defenderDies: boolean;
  damageToAttacker?: number;
  damageToDefender?: number;
};

export type PersonalCombatAnimationPlan = {
  preset: PersonalCombatAnimationPreset;
  sourceId: string;
  targetId: string;
  suppressDefaultMotion: boolean;
  castMs: number;
  impactMs: number;
  durationMs: number;
  effect: {
    type: "fireball";
    variant: "fire" | "emerald";
    scale: number;
    amount: number;
    sourceMoves: boolean;
    projectileCount?: number;
    projectileOrigin?: "split-horizontal";
    projectileGapMs?: number;
  };
};

export type PersonalAttackAnimationPlan = Omit<PersonalCombatAnimationPlan, "targetId"> & {
  targetKind: "hostLife" | "playerLife";
};

type PersonalCombatAnimationRegistration = {
  definitionId: string;
  role: PersonalCombatRole;
  outcome?: PersonalCombatOutcome;
  preset: PersonalCombatAnimationPreset;
};

type PersonalAttackAnimationRegistration = {
  definitionId: string;
  targetKind: PersonalAttackAnimationPlan["targetKind"];
  preset: PersonalCombatAnimationPreset;
};

type PersonalCombatAnimationRecipe = Omit<
  PersonalCombatAnimationPlan,
  "preset" | "sourceId" | "targetId" | "effect"
> & {
  effect: Omit<PersonalCombatAnimationPlan["effect"], "amount">;
};

// Presentation-only registrations. Rules and combat outcomes remain fully owned by the engine;
// this table only chooses how an already-decided fight should look.
const PERSONAL_COMBAT_ANIMATIONS: readonly PersonalCombatAnimationRegistration[] = [
  {
    definitionId: "vaelor_emerald_guardian",
    role: "defender",
    outcome: "wins",
    preset: "emerald-fireball",
  },
  {
    definitionId: "varka_infernal_matriarch",
    role: "attacker",
    preset: "infernal-fireball",
  },
];

// Direct attacks use the same preset catalog as card-vs-card fights. The registration decides
// only the presentation and target surface; the engine remains responsible for Host damage.
const PERSONAL_ATTACK_ANIMATIONS: readonly PersonalAttackAnimationRegistration[] = [
  {
    definitionId: "vaelor_emerald_guardian",
    targetKind: "hostLife",
    preset: "emerald-fireball",
  },
  {
    definitionId: "varka_infernal_matriarch",
    targetKind: "playerLife",
    preset: "infernal-fireball",
  },
];

const PERSONAL_COMBAT_ANIMATION_RECIPES: Record<
  PersonalCombatAnimationPreset,
  PersonalCombatAnimationRecipe
> = {
  "emerald-fireball": {
    suppressDefaultMotion: true,
    castMs: 220,
    impactMs: 638,
    durationMs: 1220,
    effect: {
      type: "fireball",
      variant: "emerald",
      scale: 1.5,
      sourceMoves: false,
    },
  },
  "infernal-fireball": {
    suppressDefaultMotion: true,
    castMs: 220,
    impactMs: 638,
    durationMs: 1220,
    effect: {
      type: "fireball",
      variant: "fire",
      scale: 0.85,
      sourceMoves: false,
      projectileCount: 2,
      projectileOrigin: "split-horizontal",
      projectileGapMs: 0,
    },
  },
};

/** Reuses a personal preset's projectile appearance outside combat without copying its visual
 * constants. Rules callers still decide targets and outcomes; this only returns presentation. */
export function resolvePersonalProjectileEffect(
  preset: PersonalCombatAnimationPreset,
  amount: number,
): PersonalCombatAnimationPlan["effect"] {
  const recipe = PERSONAL_COMBAT_ANIMATION_RECIPES[preset];
  return {
    ...recipe.effect,
    amount: Math.max(0, amount),
  };
}

/** Selects a card-specific presentation after combat has already been resolved. The first
 * matching registration wins, so future presets can be added without branching in the combat
 * sequencer or an animator component. */
export function resolvePersonalCombatAnimation(
  context: PersonalCombatAnimationContext,
): PersonalCombatAnimationPlan | undefined {
  const participants = [
    {
      role: "attacker" as const,
      card: context.attacker,
      target: context.defender,
      selfDies: context.attackerDies,
      opponentDies: context.defenderDies,
      damageToOpponent: context.damageToDefender ?? 0,
    },
    {
      role: "defender" as const,
      card: context.defender,
      target: context.attacker,
      selfDies: context.defenderDies,
      opponentDies: context.attackerDies,
      damageToOpponent: context.damageToAttacker ?? 0,
    },
  ];

  for (const participant of participants) {
    if (!participant.card || !participant.target) continue;
    const outcome = combatOutcome(participant.selfDies, participant.opponentDies);
    const registration = PERSONAL_COMBAT_ANIMATIONS.find((candidate) =>
      candidate.definitionId === participant.card?.definitionId &&
      candidate.role === participant.role &&
      (candidate.outcome === undefined || candidate.outcome === outcome),
    );
    if (!registration) continue;
    const recipe = PERSONAL_COMBAT_ANIMATION_RECIPES[registration.preset];
    return {
      preset: registration.preset,
      sourceId: participant.card.instanceId,
      targetId: participant.target.instanceId,
      suppressDefaultMotion: recipe.suppressDefaultMotion,
      castMs: recipe.castMs,
      impactMs: recipe.impactMs,
      durationMs: recipe.durationMs,
      effect: resolvePersonalProjectileEffect(registration.preset, participant.damageToOpponent),
    };
  }

  return undefined;
}

/** Selects a card-specific presentation for an unblocked attack against a life surface. */
export function resolvePersonalAttackAnimation(
  attacker: CardInstance,
  amount: number,
  targetKind: PersonalAttackAnimationPlan["targetKind"] = "hostLife",
): PersonalAttackAnimationPlan | undefined {
  const registration = PERSONAL_ATTACK_ANIMATIONS.find(
    (candidate) => candidate.definitionId === attacker.definitionId && candidate.targetKind === targetKind,
  );
  if (!registration) return undefined;

  const recipe = PERSONAL_COMBAT_ANIMATION_RECIPES[registration.preset];
  return {
    preset: registration.preset,
    sourceId: attacker.instanceId,
    targetKind: registration.targetKind,
    suppressDefaultMotion: recipe.suppressDefaultMotion,
    castMs: recipe.castMs,
    impactMs: recipe.impactMs,
    durationMs: recipe.durationMs,
    effect: resolvePersonalProjectileEffect(registration.preset, amount),
  };
}

function combatOutcome(selfDies: boolean, opponentDies: boolean): PersonalCombatOutcome {
  if (selfDies && opponentDies) return "draws";
  if (!selfDies && opponentDies) return "wins";
  if (selfDies) return "loses";
  return "survives";
}
