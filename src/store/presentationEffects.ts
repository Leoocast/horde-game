import type { CardInstance, GameState } from "../engine/GameTypes";
import { localizedTraitLabel, naturalCaseTraitLabel } from "../i18n/cardLocalization";
import { canonicalizeLogText } from "../i18n/rulesText";
import { translate, type TranslationKey } from "../i18n/translations";
import { useAudioStore } from "./useAudioStore";
import { useLanguageStore } from "./useLanguageStore";
import { useToastStore } from "./useToastStore";
import { useGameStore, type GameStore, type HostMillAnimationItem } from "./useGameStore";
import type { BuffAnimationVariant } from "./buffAnimation";

// Shared presentation plumbing for the store and its sequence modules: localized text, SFX
// policy, toast policy, and the small timed visual beats (buff pulse, auto-paid land flash)
// that used to be copy-pasted at every call site.

export const BUFF_ANIMATION_MS = 1120;
const AUTO_PAID_LAND_FLASH_MS = 900;
const HEAVY_SUMMON_DEFINITION_IDS = new Set(["ancient_canopy_watchers"]);

let buffAnimationTimer: number | undefined;
let lifeBuffAnimationTimer: number | undefined;
let autoPaidLandFlashTimer: number | undefined;

export function uiText(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(useLanguageStore.getState().language, key, params);
}

export function uiCardName(card: CardInstance): string {
  return useLanguageStore.getState().language === "es" ? card.displayNameEs || card.displayName : card.displayName;
}

export function uiTraitLabel(keyword: string): string {
  const language = useLanguageStore.getState().language;
  return naturalCaseTraitLabel(localizedTraitLabel(keyword, language));
}

export function showActionToast(message?: string): void {
  if (!message) return;
  const language = useLanguageStore.getState().language;
  useToastStore.getState().pushToast({
    title: uiText("toast.actionUnavailable"),
    message: canonicalizeLogText(message, language),
    tone: "warning",
  });
}

export function monsterSfx(card: CardInstance) {
  if (
    HEAVY_SUMMON_DEFINITION_IDS.has(card.definitionId) ||
    card.basePower > 4 ||
    card.baseEndurance > 4
  ) {
    return "playMonsterHeavy" as const;
  }
  if (card.effects.length > 0 || card.activatedAbilities.length > 0 || card.requiresTargets.length > 0) return "playMonsterEffect" as const;
  return "playMonster" as const;
}

export function playDrawOneIfPlayerDrew(previous: GameState, next: GameState): void {
  if (next.player.hand.length > previous.player.hand.length && next.player.archive.length < previous.player.archive.length) {
    useAudioStore.getState().playSfx("drawOne");
  }
}

export function findBattlefieldCard(game: GameState, id: string): CardInstance | undefined {
  return [...game.player.field, ...game.host.field].find((card) => card.instanceId === id);
}

/** Cards whose temporary stats increased or that gained a temporary keyword between two
 *  committed engine states. Keeping this diff shared lets targeted and group buffs use the same
 *  presentation rule without teaching the store individual effect types. */
export function findTemporaryBuffedCardIds(previous: GameState, next: GameState): string[] {
  const previousBuffs = new Map(
    [...previous.player.field, ...previous.host.field].map((card) => [
      card.instanceId,
      {
        power: card.temporaryPower,
        endurance: card.temporaryEndurance,
        untilNextPlayerTurnPower: card.untilNextPlayerTurnPower ?? 0,
        untilNextPlayerTurnEndurance: card.untilNextPlayerTurnEndurance ?? 0,
        traits: new Set(card.temporaryTraits),
      },
    ]),
  );
  return [...next.player.field, ...next.host.field]
    .filter((card) => {
      const before = previousBuffs.get(card.instanceId);
      if (!before) return false;
      return (
        card.temporaryPower > before.power ||
        card.temporaryEndurance > before.endurance ||
        (card.untilNextPlayerTurnPower ?? 0) > before.untilNextPlayerTurnPower ||
        (card.untilNextPlayerTurnEndurance ?? 0) > before.untilNextPlayerTurnEndurance ||
        card.temporaryTraits.some((keyword) => !before.traits.has(keyword))
      );
    })
    .map((card) => card.instanceId);
}

export function discardPauseInProgress(state: GameStore): boolean {
  return Boolean(state.handLimitDiscardActive || state.fleshRootTitheSelection?.kind === "discard" || state.playerDiscardAnimationQueue.length > 0);
}

export function resumeAfterDiscardPause(onReady: () => void): void {
  const check = () => {
    if (discardPauseInProgress(useGameStore.getState())) {
      window.setTimeout(check, 120);
      return;
    }
    onReady();
  };
  window.setTimeout(check, 120);
}

/** Starts (or restarts) the buff pulse on `cardIds` and schedules its clear. Spread the
 *  returned patch into the state update that should carry the pulse. */
export function startBuffBeat(
  cardIds: string[],
  variant: BuffAnimationVariant = "default",
): {
  buffAnimationCardIds: string[];
  buffAnimationEventId: number;
  buffAnimationVariant: BuffAnimationVariant;
} {
  if (buffAnimationTimer) window.clearTimeout(buffAnimationTimer);
  buffAnimationTimer = window.setTimeout(() => {
    useGameStore.setState({ buffAnimationCardIds: [], buffAnimationVariant: "default" });
    buffAnimationTimer = undefined;
  }, BUFF_ANIMATION_MS);
  return {
    buffAnimationCardIds: cardIds,
    buffAnimationEventId: Date.now(),
    buffAnimationVariant: variant,
  };
}

export function startLifeBuffBeat(): { lifeBuffAnimationId: number } {
  if (lifeBuffAnimationTimer) window.clearTimeout(lifeBuffAnimationTimer);
  lifeBuffAnimationTimer = window.setTimeout(() => {
    useGameStore.setState({ lifeBuffAnimationId: undefined });
    lifeBuffAnimationTimer = undefined;
  }, BUFF_ANIMATION_MS);
  return { lifeBuffAnimationId: Date.now() };
}

/** Flashes the Sources auto-Exhausted to pay a cast; returns the animation patch value (or
 *  undefined when nothing was auto-paid). */
export function flashAutoPaidLands(ids: string[]): { ids: string[]; eventId: number } | undefined {
  if (ids.length === 0) return undefined;
  if (autoPaidLandFlashTimer) window.clearTimeout(autoPaidLandFlashTimer);
  autoPaidLandFlashTimer = window.setTimeout(() => {
    useGameStore.setState({ autoPaidLandAnimation: undefined });
    autoPaidLandFlashTimer = undefined;
  }, AUTO_PAID_LAND_FLASH_MS);
  return { ids, eventId: Date.now() };
}

// Discards are derived from the card diff (Hand -> Memory), never from log text:
// the log is display-only and its wording must stay free to change or localize.
export function notifyDiscardEffects(previous: GameState, next: GameState, options?: { title: string; tone: "warning" | "host" }): void {
  const previousPlayerGraveyardIds = new Set(previous.player.memory.map((card) => card.instanceId));
  const discardedCards = next.player.memory.filter((card) => previous.player.hand.some((item) => item.instanceId === card.instanceId) && !previousPlayerGraveyardIds.has(card.instanceId));
  if (discardedCards.length === 0) return;
  const origins = new Map(
    discardedCards.map((card) => {
      const rect = document.querySelector<HTMLElement>(`[data-hand-card-id="${card.instanceId}"]`)?.getBoundingClientRect();
      return [card.instanceId, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined] as const;
    }),
  );
  useGameStore.setState((state) => ({
    playerDiscardAnimationQueue: [
      ...state.playerDiscardAnimationQueue,
      ...discardedCards.map((card) => ({
        id: `player-discard-${card.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        card,
        origin: origins.get(card.instanceId),
      })),
    ],
  }));
  for (const card of discardedCards) {
    useAudioStore.getState().playSfx("drawOne");
    useToastStore.getState().pushToast({
      title: options?.title ?? uiText("toast.hostEffect"),
      message: uiText("toast.chroniclerDiscardsCard", { card: uiCardName(card) }),
      tone: options?.tone ?? "host",
    });
  }
}

export function hostMillAnimationsFrom(previous: GameState, next: GameState): HostMillAnimationItem[] {
  const previousLibraryIds = new Set(previous.host.archive.map((card) => card.instanceId));
  return next.host.memory
    .filter((card) => previousLibraryIds.has(card.instanceId))
    .map((card) => ({
      id: `host-mill-${card.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      card,
      preview: false,
    }));
}

export function appendHostMillAnimations(state: GameStore, previous: GameState, next: GameState): HostMillAnimationItem[] {
  const milled = hostMillAnimationsFrom(previous, next);
  return milled.length > 0 ? [...state.hostMillAnimationQueue, ...milled] : state.hostMillAnimationQueue;
}
