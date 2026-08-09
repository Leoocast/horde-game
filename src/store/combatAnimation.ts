import type { CardInstance } from "../engine/GameTypes";

export type PersonalCombatAnimationPreset = "emerald-fireball" | "infernal-fireball" | "venom-bite";
export type BurnMaterialVariant = "fire" | "oil" | "emerald" | "golden";
export type PersonalCombatRole = "attacker" | "defender";
export type PersonalCombatOutcome = "wins" | "loses" | "draws" | "survives";
export type PersonalAttackTargetKind = "card" | "hostLife" | "playerLife";

export type PersonalCombatAnimationContext = {
  attacker: CardInstance;
  defender?: CardInstance;
  attackerDies: boolean;
  defenderDies: boolean;
  damageToAttacker?: number;
  damageToDefender?: number;
};

export type PersonalFireballEffect = {
  type: "fireball";
  variant: BurnMaterialVariant;
  scale: number;
  amount: number;
  sourceMoves: boolean;
  projectileCount?: number;
  projectileOrigin?: "split-horizontal";
  projectileGapMs?: number;
};

export type PersonalBiteEffect = {
  type: "bite";
  variant: "blood" | "venom";
  amount: number;
};

export type PersonalAttackEffect = PersonalFireballEffect | PersonalBiteEffect;

export type PersonalCombatAnimationPlan = {
  preset: PersonalCombatAnimationPreset;
  sourceId: string;
  targetId: string;
  suppressDefaultMotion: boolean;
  castMs: number;
  impactMs: number;
  durationMs: number;
  effect: PersonalAttackEffect;
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
  targetKinds: readonly PersonalAttackTargetKind[];
  preset: PersonalCombatAnimationPreset;
};

type PersonalFireballEffectRecipe = Omit<PersonalFireballEffect, "amount">;
type PersonalBiteEffectRecipe = Omit<PersonalBiteEffect, "amount">;
type PersonalCombatAnimationRecipe = Pick<
  PersonalCombatAnimationPlan,
  "suppressDefaultMotion" | "castMs" | "impactMs" | "durationMs"
> & { effect: PersonalFireballEffectRecipe | PersonalBiteEffectRecipe };

const PERSONAL_BURN_MATERIALS = {
  varka_infernal_matriarch: "golden",
} as const satisfies Record<string, BurnMaterialVariant>;

const CARD_BURN_SCALES = {
  all_against_one: 1.2,
  varka_infernal_matriarch: 1.3,
} as const satisfies Record<string, number>;

/** Resolves a card-owned Burn material independently of the event shape. This keeps every Burn
 * sourced by Varka golden, including entry volleys and any future single-target Burn. */
export function resolveCardBurnMaterial(
  sourceDefinitionId: string | undefined,
  fallback: BurnMaterialVariant = "fire",
): BurnMaterialVariant {
  return sourceDefinitionId
    ? PERSONAL_BURN_MATERIALS[sourceDefinitionId as keyof typeof PERSONAL_BURN_MATERIALS] ?? fallback
    : fallback;
}

/** Card-owned scale shared by personal combat, deferred volleys and rules-triggered Burns. */
export function resolveCardBurnScale(sourceDefinitionId: string | undefined, fallback = 1): number {
  return sourceDefinitionId
    ? CARD_BURN_SCALES[sourceDefinitionId as keyof typeof CARD_BURN_SCALES] ?? fallback
    : fallback;
}

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
    targetKinds: ["card", "hostLife"],
    preset: "emerald-fireball",
  },
  {
    definitionId: "varka_infernal_matriarch",
    targetKinds: ["card", "playerLife"],
    preset: "infernal-fireball",
  },
  {
    definitionId: "hydra_of_the_black_bough",
    targetKinds: ["card", "hostLife"],
    preset: "venom-bite",
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
      scale: 1.8,
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
      variant: PERSONAL_BURN_MATERIALS.varka_infernal_matriarch,
      scale: CARD_BURN_SCALES.varka_infernal_matriarch,
      sourceMoves: false,
      projectileCount: 2,
      projectileOrigin: "split-horizontal",
      projectileGapMs: 0,
    },
  },
  "venom-bite": {
    suppressDefaultMotion: false,
    castMs: 40,
    impactMs: 90,
    durationMs: 780,
    effect: {
      type: "bite",
      variant: "venom",
    },
  },
};

/** Reuses a personal preset's projectile appearance outside combat without copying its visual
 * constants. Rules callers still decide targets and outcomes; this only returns presentation. */
export function resolvePersonalProjectileEffect(
  preset: Exclude<PersonalCombatAnimationPreset, "venom-bite">,
  amount: number,
): PersonalFireballEffect {
  const recipe = PERSONAL_COMBAT_ANIMATION_RECIPES[preset];
  if (recipe.effect.type !== "fireball") {
    throw new Error(`${preset} is not a projectile presentation.`);
  }
  return {
    ...recipe.effect,
    amount: Math.max(0, amount),
  };
}

function resolvePersonalAttackEffect(
  preset: PersonalCombatAnimationPreset,
  amount: number,
): PersonalAttackEffect {
  const effect = PERSONAL_COMBAT_ANIMATION_RECIPES[preset].effect;
  if (effect.type === "fireball") {
    return { ...effect, amount: Math.max(0, amount) };
  }
  return {
    ...effect,
    amount: Math.max(0, amount),
  };
}

/** Selects a card-specific presentation after combat has already been resolved. When exactly one
 * combatant survives, only that winner may own the personal animation; a losing source must not
 * visually defeat the card that killed it. Ties keep attacker-first registration order. */
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
  const presentationParticipants = context.attackerDies !== context.defenderDies
    ? participants.filter((participant) => !participant.selfDies)
    : participants;

  for (const participant of presentationParticipants) {
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
      effect: resolvePersonalAttackEffect(registration.preset, participant.damageToOpponent),
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
    (candidate) => candidate.definitionId === attacker.definitionId && candidate.targetKinds.includes(targetKind),
  );
  if (!registration) return undefined;

  const recipe = PERSONAL_COMBAT_ANIMATION_RECIPES[registration.preset];
  return {
    preset: registration.preset,
    sourceId: attacker.instanceId,
    targetKind,
    suppressDefaultMotion: recipe.suppressDefaultMotion,
    castMs: recipe.castMs,
    impactMs: recipe.impactMs,
    durationMs: recipe.durationMs,
    effect: resolvePersonalAttackEffect(registration.preset, amount),
  };
}

/** Selects the same card-owned attack presentation when an effect makes that card deal damage to
 * another card. The caller owns rules resolution; this registry only supplies the visual plan. */
export function resolvePersonalTargetedAttackAnimation(
  attacker: CardInstance,
  target: CardInstance,
  amount: number,
): PersonalCombatAnimationPlan | undefined {
  const registration = PERSONAL_ATTACK_ANIMATIONS.find(
    (candidate) => candidate.definitionId === attacker.definitionId && candidate.targetKinds.includes("card"),
  );
  if (!registration) return undefined;

  const recipe = PERSONAL_COMBAT_ANIMATION_RECIPES[registration.preset];
  return {
    preset: registration.preset,
    sourceId: attacker.instanceId,
    targetId: target.instanceId,
    suppressDefaultMotion: recipe.suppressDefaultMotion,
    castMs: recipe.castMs,
    impactMs: recipe.impactMs,
    durationMs: recipe.durationMs,
    effect: resolvePersonalAttackEffect(registration.preset, amount),
  };
}

function combatOutcome(selfDies: boolean, opponentDies: boolean): PersonalCombatOutcome {
  if (selfDies && opponentDies) return "draws";
  if (!selfDies && opponentDies) return "wins";
  if (selfDies) return "loses";
  return "survives";
}
