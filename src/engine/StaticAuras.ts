import type { CardFilter, GameState, Side } from "./GameTypes";
import type { Trait } from "./hostfallVocabulary";
import { isTrait } from "./hostfallVocabulary";
import { matchesFilter, resolveAffectedController } from "./StaticEffects";

// Static abilities apply continuously, so the player only ever sees the numbers already changed
// and has to hunt for the card responsible. These helpers describe *who each static ability
// currently covers* so the UI can announce a source when its coverage grows. Rules are untouched:
// nothing here feeds getPowerEndurance or getTraits.

const STATIC_AURA_EFFECT_TYPES = new Set(["STATIC_BUFF", "STATIC_GRANT_KEYWORD"]);

export type StaticAura = {
  /** Stable across turns: the granting instance plus which of its effects this is. */
  key: string;
  sourceId: string;
  controller: Side;
  power: number;
  endurance: number;
  keyword?: Trait;
  affectedIds: string[];
};

export type StaticAuraSnapshot = Record<string, string[]>;

export function collectStaticAuras(game: GameState, controller?: Side): StaticAura[] {
  const auras: StaticAura[] = [];
  const field = [...game.player.field, ...game.host.field];
  for (const source of field) {
    if (controller && source.controller !== controller) continue;
    source.effects.forEach((effect, index) => {
      if (!STATIC_AURA_EFFECT_TYPES.has(effect.type)) return;
      const affectedController = resolveAffectedController(source.controller, effect.controller);
      const affected = field.filter(
        (card) =>
          (!affectedController || card.controller === affectedController) &&
          matchesFilter(card, effect.filter as CardFilter | undefined, source),
      );
      if (affected.length === 0) return;
      auras.push({
        key: `${source.instanceId}::${index}`,
        sourceId: source.instanceId,
        controller: source.controller,
        power: Number(effect.power ?? 0),
        endurance: Number(effect.endurance ?? 0),
        keyword: isTrait(effect.keyword) ? effect.keyword : undefined,
        affectedIds: affected.map((card) => card.instanceId),
      });
    });
  }
  return auras;
}

export function snapshotStaticAuras(auras: StaticAura[]): StaticAuraSnapshot {
  return Object.fromEntries(auras.map((aura) => [aura.key, aura.affectedIds]));
}

/**
 * Auras whose covered set grew since `snapshot`, narrowed to the cards that just joined.
 * An aura whose coverage only shrank (a buffed creature died) is not worth announcing.
 */
export function newlyCoveredAuras(auras: StaticAura[], snapshot: StaticAuraSnapshot): StaticAura[] {
  const grown: StaticAura[] = [];
  for (const aura of auras) {
    const known = new Set(snapshot[aura.key] ?? []);
    const added = aura.affectedIds.filter((id) => !known.has(id));
    if (added.length > 0) grown.push({ ...aura, affectedIds: added });
  }
  return grown;
}

/**
 * Stat bonus each card is receiving from auras that have not been announced yet, so the UI can
 * hold it back until the announcing beat plays. Trait grants are not held: they read as an
 * ability, not as a number that silently changed.
 */
export function heldAuraBonuses(auras: StaticAura[]): Record<string, { power: number; endurance: number }> {
  const held: Record<string, { power: number; endurance: number }> = {};
  for (const aura of auras) {
    if (aura.power === 0 && aura.endurance === 0) continue;
    for (const id of aura.affectedIds) {
      const current = held[id] ?? { power: 0, endurance: 0 };
      held[id] = { power: current.power + aura.power, endurance: current.endurance + aura.endurance };
    }
  }
  return held;
}
