import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { blockRestrictionReason, canAttack, canBlockAttacker, hasKeyword } from "../engine/Keywords";
import { targetCandidatesWithSelectedTargets, targetRequirementIsBuff } from "../engine/Targeting";
import { getPowerToughness } from "../engine/StaticEffects";
import { MAX_PLAYER_LANDS } from "../engine/GameRules";
import { STORED_MANA_CAP } from "../engine/ManaSystem";
import { getTutorialSpotlightZones, getTutorialStepId, isTutorialAwaitingContinue, isTutorialSeed } from "../engine/Tutorial";
import { useTranslation } from "../i18n/useTranslation";
import { translate } from "../i18n/translations";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { useAudioStore } from "../store/useAudioStore";
import { useToastStore } from "../store/useToastStore";
import { renderCardText } from "../utils/cardTextSymbols";
import { cardStatState } from "../utils/selectors";
import { Card } from "./Card";
import { Zone } from "./Zone";
import { AnimatePresence, motion } from "framer-motion";
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  game: GameState;
  side: Side;
  cards: CardInstance[];
};

const blockColors = ["#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6", "#818cf8"];
const BLOCK_DRAG_THRESHOLD_PX = 9;
const PLAYER_ATTACK_DRAG_THRESHOLD_PX = 9;
const BATTLEFIELD_OVERFLOW_SAFE_INSET_PX = 132;
const BATTLEFIELD_OVERFLOW_HYSTERESIS_PX = 24;
// Feature flag: disable to show full creature cards whenever the row has enough room.
const ALWAYS_CROP_BATTLEFIELD_CREATURE_CARDS = true;

type BattlefieldRowSurfaceProps = {
  cardsEmpty: boolean;
  compact?: boolean;
  cropCreatureCards: boolean;
  creatureRowRef: RefObject<HTMLDivElement | null>;
  dropTarget?: string;
  children: ReactNode;
  otherPermanents?: ReactNode;
  otherPermanentsTargetingActive?: boolean;
};

function BattlefieldRowSurface({
  cardsEmpty,
  compact = false,
  cropCreatureCards,
  creatureRowRef,
  dropTarget,
  children,
  otherPermanents,
  otherPermanentsTargetingActive = false,
}: BattlefieldRowSurfaceProps) {
  return (
    <div data-battlefield-drop-target={dropTarget} className="old-panel-soft relative p-1.5">
      {cardsEmpty ? (
        <div aria-label="Empty battlefield" className={["battlefield-row-surface", compact ? "battlefield-empty-compact" : "battlefield-empty"].join(" ")} />
      ) : (
        <div
          ref={creatureRowRef}
          data-battlefield-overflowing={cropCreatureCards ? "true" : undefined}
          className={[
            "battlefield-row-surface flex flex-wrap items-center justify-center gap-2",
            compact ? "battlefield-row-body-compact" : "battlefield-row-body",
            cropCreatureCards ? "battlefield-row-overflow" : "",
          ].join(" ")}
        >
          {children}
        </div>
      )}
      {otherPermanents !== undefined && (
        <div className={["other-permanents-dock", otherPermanentsTargetingActive ? "z-[96]" : "z-20"].join(" ")}>
          {otherPermanents}
        </div>
      )}
    </div>
  );
}

export function Battlefield({ game, side, cards }: Props) {
  const t = useTranslation();
  const seenCardIds = useRef<Set<string>>(new Set(cards.map((card) => card.instanceId)));
  const animatedHordeIds = useRef<Set<string>>(new Set());
  const entranceAnimatingIds = useRef<Set<string>>(new Set());
  const activeReflowAnimations = useRef<Map<string, Animation>>(new Map());
  const seenAutoPaidEvents = useRef<Set<number>>(new Set());
  const boardRef = useRef<HTMLDivElement>(null);
  const landDockRef = useRef<HTMLElement>(null);
  const creatureRowRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef<Map<string, { left: number; top: number }>>(new Map());
  const reflowSampleFrame = useRef<number | undefined>(undefined);
  const previousHordeEntrySignature = useRef(cards.map((card) => card.instanceId).join("|"));
  const previousPlayerAttackers = useRef<Set<string>>(new Set());
  const suppressNextSelectIds = useRef<Set<string>>(new Set());
  const battlefieldCardOrder = useRef<Map<string, number>>(new Map());
  const battlefieldFamilyOrder = useRef<Map<string, number>>(new Map());
  const zombieWaveByCardId = useRef<Map<string, number>>(new Map());
  const zombieWaveOrder = useRef<Map<number, number>>(new Map());
  const nextBattlefieldOrder = useRef(0);
  const nextZombieWaveId = useRef(0);
  const currentZombieEntryWaveId = useRef<number | undefined>(undefined);
  const currentZombieEntryWaveTurn = useRef<number | undefined>(undefined);
  const [creatureRowOverflowing, setCreatureRowOverflowing] = useState(false);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const resolvingHordeCombat = useGameStore((state) => state.resolvingHordeCombat);
  const playerAttackAnimationId = useGameStore((state) => state.playerAttackAnimation?.attackerId);
  const hordeAttackAnimationAttackerId = useGameStore((state) => state.hordeAttackAnimation?.attackerId);
  const hordeAttackAnimationBlockerId = useGameStore((state) => state.hordeAttackAnimation?.blockerId);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const activatingEffectCardId = useGameStore((state) => state.activatingEffectCardId);
  // Split into primitive/stable selectors so mousemove-driven x/y updates on these
  // targeting states (see CounterTargetingOverlay/SpellTargetingOverlay/SmallpoxSelectionOverlay)
  // don't force a full Battlefield re-render on every pointer event.
  const counterTargetingActive = useGameStore((state) => Boolean(state.counterTargeting));
  const counterTargetingTargetId = useGameStore((state) => state.counterTargeting?.targetId);
  const smallpoxSelectionActive = useGameStore((state) => Boolean(state.smallpoxSelection));
  const smallpoxSelectionKind = useGameStore((state) => state.smallpoxSelection?.kind);
  const smallpoxSelectionTargetId = useGameStore((state) => state.smallpoxSelection?.targetId);
  const spellTargetingActive = useGameStore((state) => Boolean(state.spellTargeting));
  const spellTargetingHandId = useGameStore((state) => state.spellTargeting?.handId);
  const spellTargetingStepIndex = useGameStore((state) => state.spellTargeting?.stepIndex);
  const spellTargetingTargets = useGameStore((state) => state.spellTargeting?.targets);
  const buffAnimationCardIds = useGameStore((state) => state.buffAnimationCardIds);
  const buffAnimationEventId = useGameStore((state) => state.buffAnimationEventId);
  const pendingTriggeredEffectSourceId = useGameStore((state) => state.pendingTriggeredEffectSourceId);
  const hordeCombatVisualDamage = useGameStore((state) => state.hordeCombatVisualDamage);
  const hordeCombatDeadCardIds = useGameStore((state) => state.hordeCombatDeadCardIds);
  const specialDeadCardIds = useGameStore((state) => state.specialDeadCardIds);
  const autoPaidLandAnimation = useGameStore((state) => state.autoPaidLandAnimation);
  // Only the blocker id is used here; blockDrag.x/y update on every mousemove while
  // dragging and are consumed by CombatArrows, not here — same rationale as the
  // targeting selectors above.
  const blockDragActive = useGameStore((state) => Boolean(state.blockDrag));
  const blockDragBlockerId = useGameStore((state) => state.blockDrag?.blockerId);
  const selectPlayerCreature = useGameStore((state) => state.selectPlayerCreature);
  const selectHordeCreature = useGameStore((state) => state.selectHordeCreature);
  const selectActiveEffectCard = useGameStore((state) => state.selectActiveEffectCard);
  const triggerEffectActivationPulse = useGameStore((state) => state.triggerEffectActivationPulse);
  const activateAbility = useGameStore((state) => state.activateAbility);
  const lockCounterTarget = useGameStore((state) => state.lockCounterTarget);
  const lockSmallpoxSelectionTarget = useGameStore((state) => state.lockSmallpoxSelectionTarget);
  const toggleAttacker = useGameStore((state) => state.toggleAttacker);
  const declareBlocker = useGameStore((state) => state.declareBlocker);
  const startBlockDrag = useGameStore((state) => state.startBlockDrag);
  const updateBlockDrag = useGameStore((state) => state.updateBlockDrag);
  const cancelBlockDrag = useGameStore((state) => state.cancelBlockDrag);
  const startPlayerAttackDrag = useGameStore((state) => state.startPlayerAttackDrag);
  const updatePlayerAttackDrag = useGameStore((state) => state.updatePlayerAttackDrag);
  const cancelPlayerAttackDrag = useGameStore((state) => state.cancelPlayerAttackDrag);
  const endSummoningAnimation = useGameStore((state) => state.endSummoningAnimation);
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);

  const creatures = cards.filter((card) => card.cardTypes.includes("Creature"));
  const lands = cards.filter((card) => card.cardTypes.includes("Land"));
  const others = cards.filter((card) => !card.cardTypes.includes("Creature") && !card.cardTypes.includes("Land"));
  const hordeCombat = game.activeSide === "horde" && game.phase === "combat" && game.combat.hordeAttackers.length > 0;
  const tutorialStepId = isTutorialSeed(game) ? getTutorialStepId(game) : null;
  const tutorialZones = tutorialStepId ? getTutorialSpotlightZones(game, tutorialStepId, tutorialAcknowledgedStepId === tutorialStepId) : [];
  const tutorialAwaitingContinue = isTutorialAwaitingContinue(game, tutorialAcknowledgedStepId);
  const cropCreatureCards = ALWAYS_CROP_BATTLEFIELD_CREATURE_CARDS || creatureRowOverflowing;

  useLayoutEffect(() => {
    const row = creatureRowRef.current;
    if (!row) return;
    const observedRow = row;
    let frame = 0;

    function measureOverflow() {
      const styles = window.getComputedStyle(observedRow);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const stacks = Array.from(observedRow.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      const requiredWidth = stacks.reduce((total, stack) => total + stack.getBoundingClientRect().width, 0) + Math.max(0, stacks.length - 1) * gap;
      const safeWidth = Math.max(0, observedRow.clientWidth - BATTLEFIELD_OVERFLOW_SAFE_INSET_PX * 2);

      setCreatureRowOverflowing((current) => {
        const threshold = current ? safeWidth - BATTLEFIELD_OVERFLOW_HYSTERESIS_PX : safeWidth;
        return requiredWidth > threshold;
      });
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureOverflow);
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(observedRow);
    for (const child of Array.from(observedRow.children)) observer.observe(child);
    scheduleMeasure();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  useLayoutEffect(() => {
    if (!autoPaidLandAnimation || seenAutoPaidEvents.current.has(autoPaidLandAnimation.eventId)) return;
    const root = boardRef.current;
    if (!root) return;

    seenAutoPaidEvents.current.add(autoPaidLandAnimation.eventId);
    for (const id of autoPaidLandAnimation.ids) {
      const slot = root.querySelector<HTMLElement>(`[data-card-slot-id="${id}"]`) ?? landDockRef.current?.querySelector<HTMLElement>(`[data-card-slot-id="${id}"]`);
      if (!slot) continue;
      const layer = document.createElement("span");
      layer.className = "auto-paid-animation-layer";
      layer.setAttribute("aria-hidden", "true");
      slot.appendChild(layer);
      layer.addEventListener("animationend", () => layer.remove(), { once: true });
    }
  }, [autoPaidLandAnimation]);

  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return;

    // If this render wraps the creature row from N lines to N+1 (or collapses it back),
    // let the existing cards' reflow-nudge settle before a newly-summoned card's entrance
    // animation plays, instead of both happening in the same frame. The measured outer
    // layout slot is not transformed by the entrance animation, which runs two layers in.
    const creatureLayoutElements = Array.from(creatureRowRef.current?.querySelectorAll<HTMLElement>("[data-card-layout-id]") ?? []);
    const previousCreatureTops: number[] = [];
    const nextCreatureTops: number[] = [];
    for (const element of creatureLayoutElements) {
      const id = element.dataset.cardLayoutId;
      if (!id) continue;
      nextCreatureTops.push(element.getBoundingClientRect().top);
      const previous = previousRects.current.get(id);
      if (previous) previousCreatureTops.push(previous.top);
    }
    const creatureRowCountIncreased = previousCreatureTops.length > 0 && countRowBands(nextCreatureTops) > countRowBands(previousCreatureTops);
    const rowShiftSettleDelay = creatureRowCountIncreased ? 0.26 : 0;

    if (side === "player") {
      const currentAttackers = new Set(game.combat.playerAttackers);
      for (const attackerId of currentAttackers) {
        if (previousPlayerAttackers.current.has(attackerId)) continue;
        const visual = root.querySelector<HTMLElement>(`[data-card-slot-id="${attackerId}"]`);
        if (visual) animateReadiedShift(visual, true);
      }
      for (const attackerId of previousPlayerAttackers.current) {
        if (currentAttackers.has(attackerId)) continue;
        const visual = root.querySelector<HTMLElement>(`[data-card-slot-id="${attackerId}"]`);
        if (visual) animateReadiedShift(visual, false);
      }
      previousPlayerAttackers.current = currentAttackers;
    }

    const currentHordeEntrySignature = cards.map((card) => card.instanceId).join("|");
    if (side === "horde" && currentHordeEntrySignature !== previousHordeEntrySignature.current) {
      for (const card of cards) {
        if (animatedHordeIds.current.has(card.instanceId)) continue;
        const visual = root.querySelector<HTMLElement>(`[data-card-slot-id="${card.instanceId}"]`);
        if (!visual) continue;
        animatedHordeIds.current.add(card.instanceId);
        seenCardIds.current.add(card.instanceId);
        entranceAnimatingIds.current.add(card.instanceId);
        visual.style.opacity = "0";
        visual.style.transform = "translateY(-46px) scale(1.55) rotate(-3deg)";
        visual.style.filter = "brightness(1.8) saturate(1.25)";
        const animation = visual.animate(
          [
            {
              opacity: 0,
              transform: "translateY(-46px) scale(1.55) rotate(-3deg)",
              filter: "brightness(1.8) saturate(1.25)",
            },
            {
              opacity: 1,
              transform: "translateY(0) scale(1) rotate(0)",
              filter: "brightness(1) saturate(1)",
            },
          ],
          {
            duration: 360,
            delay: (hordeEntryDelay(card) + (card.cardTypes.includes("Creature") ? rowShiftSettleDelay : 0)) * 1000,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        );
        animation.onfinish = () => {
          visual.style.opacity = "";
          visual.style.transform = "";
          visual.style.filter = "";
          // fill:"both" is only needed through the entrance delay. Release the finished
          // WAAPI effect so later CSS effects (for example Sunshower's activation pulse)
          // can own transform/filter on this slot again.
          animation.cancel();
          entranceAnimatingIds.current.delete(card.instanceId);
        };
      }
    }
    if (side === "horde") previousHordeEntrySignature.current = currentHordeEntrySignature;

    const summoningElements = [
      ...Array.from(root.querySelectorAll<HTMLElement>("[data-summoning='true']")),
      ...Array.from(landDockRef.current?.querySelectorAll<HTMLElement>("[data-summoning='true']") ?? []),
    ];
    for (const visual of summoningElements) {
      const id = visual.dataset.cardSlotId;
      const summonedCard = id ? cards.find((item) => item.instanceId === id) : undefined;
      const entranceExtraDelay = summonedCard?.cardTypes.includes("Creature") ? rowShiftSettleDelay : 0;
      if (id) {
        seenCardIds.current.add(id);
        entranceAnimatingIds.current.add(id);
      }
      const animation = visual.animate(
        [
          {
            opacity: 0,
            transform: `translateY(${side === "horde" ? "-46px" : "46px"}) scale(1.55) rotate(${side === "horde" ? "-3deg" : "3deg"})`,
            filter: "brightness(1.8) saturate(1.25)",
          },
          {
            opacity: 1,
            transform: "translateY(0) scale(1) rotate(0)",
            filter: "brightness(1) saturate(1)",
          },
        ],
        {
          duration: 360,
          delay: (Number(visual.dataset.entryDelay ?? 0) + entranceExtraDelay) * 1000,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          // "both" keeps the card invisible through the delay (e.g. while the row it
          // just wrapped settles) instead of showing it statically before the entrance.
          fill: "both",
        },
      );
      animation.onfinish = () => {
        // Do not leave the final fill frame attached to this stable DOM node: a retained
        // WAAPI transform/filter outranks the CSS activation and targeting animations that
        // run immediately after an enters-the-battlefield trigger such as Sunshower Druid.
        animation.cancel();
        if (side === "player") endSummoningAnimation();
        if (id) entranceAnimatingIds.current.delete(id);
      };
      visual.removeAttribute("data-summoning");
    }

    // Single owner of battlefield position changes: measure the stable outer layout slot,
    // then FLIP-animate a dedicated middle layer. The inner [data-card-slot-id] remains the
    // sole owner of summon/effect transforms and contains the buff particles, so neither
    // visual can be replaced or cancelled by the row reflow animation.
    // Sampled over a short window (not just once per render) because CSS margin transitions
    // can re-wrap the row a few frames AFTER the render that started them.
    const REFLOW_MIN_DELTA_PX = 4;
    const liveInstanceIds = new Set(cards.map((card) => card.instanceId));

    const observedRoot = root;
    function sampleReflow() {
      const seenIds = new Set<string>();
      for (const element of Array.from(observedRoot.querySelectorAll<HTMLElement>("[data-card-layout-id]"))) {
        const id = element.dataset.cardLayoutId;
        if (!id) continue;
        // Skip cards leaving the battlefield: popLayout keeps them in the DOM (often
        // position:absolute) while their exit animation runs, and their sampled position is
        // meaningless. Also skip cards still playing their entrance — they own their slot.
        if (!liveInstanceIds.has(id) || entranceAnimatingIds.current.has(id)) {
          seenIds.add(id);
          const current = element.getBoundingClientRect();
          previousRects.current.set(id, { left: current.left, top: current.top });
          continue;
        }
        seenIds.add(id);
        const current = element.getBoundingClientRect();
        const previous = previousRects.current.get(id);
        previousRects.current.set(id, current);
        if (!previous) continue;

        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        if (Math.abs(deltaX) < REFLOW_MIN_DELTA_PX && Math.abs(deltaY) < REFLOW_MIN_DELTA_PX) continue;

        const reflowLayer = element.querySelector<HTMLElement>("[data-card-reflow-id]");
        const slot = element.querySelector<HTMLElement>("[data-card-slot-id]");
        if (!reflowLayer || !slot || slot.style.visibility === "hidden") continue;
        // A card can get re-reflowed more than once in quick succession (each further
        // arrival in the same wave nudges it again). Cancel the previous reflow nudge
        // before layering a new one so they don't pile up additively and overshoot.
        activeReflowAnimations.current.get(id)?.cancel();
        const reflowAnimation = reflowLayer.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }], {
          duration: 360,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
        activeReflowAnimations.current.set(id, reflowAnimation);
        const clearReflowAnimation = () => {
          if (activeReflowAnimations.current.get(id) === reflowAnimation) activeReflowAnimations.current.delete(id);
        };
        reflowAnimation.onfinish = clearReflowAnimation;
        reflowAnimation.oncancel = clearReflowAnimation;
      }
      for (const id of Array.from(previousRects.current.keys())) {
        if (!seenIds.has(id)) previousRects.current.delete(id);
      }
    }

    const reflowWindowEnd = performance.now() + 450;
    function reflowSampleLoop() {
      sampleReflow();
      reflowSampleFrame.current = performance.now() < reflowWindowEnd ? window.requestAnimationFrame(reflowSampleLoop) : undefined;
    }
    sampleReflow();
    reflowSampleFrame.current = window.requestAnimationFrame(reflowSampleLoop);
    return () => {
      if (reflowSampleFrame.current !== undefined) window.cancelAnimationFrame(reflowSampleFrame.current);
    };
  });

  const otherPermanentsTargetingActive = others.some((card) => isSpellTargetable(card) || isSpellTargetLocked(card));

  return (
    <>
      <Zone title={side === "player" ? "Chronicler Battlefield" : "Horde Battlefield"} count={side === "player" ? creatures.length + others.length : cards.length} hideHeader>
        <div ref={boardRef} className="battlefield-side-content">
          <BattlefieldRowSurface
            cardsEmpty={creatures.length === 0}
            cropCreatureCards={cropCreatureCards}
            creatureRowRef={creatureRowRef}
            dropTarget={side === "horde" ? "player-attack" : undefined}
            otherPermanents={others.length > 0 ? renderOtherPermanentStacks(others) : undefined}
            otherPermanentsTargetingActive={otherPermanentsTargetingActive}
          >
            {renderCardStacks(creatures, false, "creature")}
          </BattlefieldRowSurface>
        </div>
      </Zone>
      {side === "player" && createPortal(LandDock(), document.body)}
    </>
  );

  function LandDock() {
    const landCount = lands.length;
    const smallpoxLandSelectionActive = smallpoxSelectionKind === "sacrifice-land";
    const availableLandCount = lands.filter((card) => !card.tapped && !card.activatedThisTurn).length;
    const storedManaCount = game.player.manaPool.colorless;
    const smallpoxLandTarget = lands.find((card) => !card.tapped && !card.activatedThisTurn) ?? lands[0];
    const canSelectManaCore = smallpoxLandSelectionActive && !smallpoxSelectionTargetId && Boolean(smallpoxLandTarget);
    const normalManaSlots = Array.from({ length: 4 });
    const storedManaSlots = Array.from({ length: 3 });

    return (
      <aside
        ref={landDockRef}
        data-player-mana-core="true"
        data-smallpox-mana-target={smallpoxLandSelectionActive ? "true" : undefined}
        data-audio-click={canSelectManaCore ? "valid" : undefined}
        role={canSelectManaCore ? "button" : undefined}
        tabIndex={canSelectManaCore ? 0 : undefined}
        aria-label={`${t("game.normalMana")}: ${availableLandCount} of ${MAX_PLAYER_LANDS}. ${t("game.storedMana")}: ${storedManaCount} of ${STORED_MANA_CAP}.`}
        className={[
          "player-mana-core",
          "player-mana-corner",
          game.activeSide === "player" ? "is-player-turn" : "",
          smallpoxLandSelectionActive ? "is-targeting" : "",
        ].join(" ")}
        onClick={() => {
          if (canSelectManaCore && smallpoxLandTarget) lockSmallpoxSelectionTarget(smallpoxLandTarget.instanceId);
        }}
        onKeyDown={(event) => {
          if (canSelectManaCore && smallpoxLandTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            lockSmallpoxSelectionTarget(smallpoxLandTarget.instanceId);
          }
        }}
      >
        <div className="mana-corner-orb" aria-hidden="true">
          <div className="mana-core-rings">
            <span className="mana-core-ring mana-core-ring-outer" />
            <span className="mana-core-ring mana-core-ring-inner" />
          </div>
          <div className="mana-core-heart"><span className="mana-core-heart-light" /></div>
        </div>
        <div className="mana-corner-energy-layer" aria-hidden="true">
          <div className="mana-energy-track mana-energy-track-blue">
            {normalManaSlots.map((_, index) => {
              const state = index < availableLandCount ? "is-ready" : index < landCount ? "is-spent" : "is-empty";
              return (
                <span key={`normal-mana-${index}-${state}`} className={`mana-alchemy-socket mana-alchemy-socket-blue ${state}`}>
                  <span className="mana-alchemy-orb"><span className="mana-alchemy-liquid" /></span>
                </span>
              );
            })}
          </div>
          <div className="mana-energy-track mana-energy-track-yellow">
            {storedManaSlots.map((_, index) => {
              const state = index < storedManaCount ? "is-ready" : "is-empty";
              return (
                <span key={`stored-mana-${index}-${state}`} className={`mana-alchemy-socket mana-alchemy-socket-yellow ${state}`}>
                  <span className="mana-alchemy-orb"><span className="mana-alchemy-liquid" /></span>
                </span>
              );
            })}
          </div>
        </div>
        {smallpoxLandSelectionActive && <div className="mana-core-target-label">{t("target.discardEnergy")}</div>}
      </aside>
    );
  }

  function renderCardStacks(rowCards: CardInstance[], compact = false, keyPrefix = "card") {
    const activeCardIds = new Set(rowCards.map((card) => card.instanceId));
    const activeDefinitionIds = new Set(rowCards.map((card) => card.definitionId));
    for (const instanceId of battlefieldCardOrder.current.keys()) {
      if (!activeCardIds.has(instanceId)) battlefieldCardOrder.current.delete(instanceId);
    }
    for (const definitionId of battlefieldFamilyOrder.current.keys()) {
      if (!activeDefinitionIds.has(definitionId)) battlefieldFamilyOrder.current.delete(definitionId);
    }
    for (const instanceId of zombieWaveByCardId.current.keys()) {
      if (!activeCardIds.has(instanceId)) zombieWaveByCardId.current.delete(instanceId);
    }
    const activeZombieWaveIds = new Set(zombieWaveByCardId.current.values());
    for (const waveId of zombieWaveOrder.current.keys()) {
      if (!activeZombieWaveIds.has(waveId)) zombieWaveOrder.current.delete(waveId);
    }

    for (const card of rowCards) {
      if (!battlefieldCardOrder.current.has(card.instanceId)) {
        const entryOrder = nextBattlefieldOrder.current;
        battlefieldCardOrder.current.set(card.instanceId, entryOrder);
        nextBattlefieldOrder.current += 1;

        if (isZombieToken(card)) {
          if (currentZombieEntryWaveId.current === undefined || currentZombieEntryWaveTurn.current !== game.turnNumber) {
            currentZombieEntryWaveId.current = nextZombieWaveId.current;
            nextZombieWaveId.current += 1;
            currentZombieEntryWaveTurn.current = game.turnNumber;
            zombieWaveOrder.current.set(currentZombieEntryWaveId.current, entryOrder);
          }
          zombieWaveByCardId.current.set(card.instanceId, currentZombieEntryWaveId.current);
        } else {
          currentZombieEntryWaveId.current = undefined;
          currentZombieEntryWaveTurn.current = undefined;
        }
      }
      if (!battlefieldFamilyOrder.current.has(card.definitionId)) {
        battlefieldFamilyOrder.current.set(card.definitionId, battlefieldCardOrder.current.get(card.instanceId) ?? 0);
      }
    }

    return groupBattlefieldCopies(
      game,
      rowCards,
      battlefieldCardOrder.current,
      battlefieldFamilyOrder.current,
      zombieWaveByCardId.current,
      zombieWaveOrder.current,
      pendingTriggeredEffectSourceId ? new Set([pendingTriggeredEffectSourceId]) : undefined,
    ).map((group) => (
      <div
        key={`${keyPrefix}-stack-${group.key}`}
        className={["battlefield-copy-stack", compact ? "battlefield-copy-stack-compact" : ""].join(" ")}
        data-stacked={group.cards.length > 1 ? "true" : undefined}
      >
        {/* A live card can move from one stat stack to another. Keeping an AnimatePresence
            inside each stack leaves an exiting duplicate behind while the same card's new
            reflow/buff animation is already running. The battlefield's FLIP layer owns that
            movement; death effects are staged before the card is removed from game state. */}
        {group.cards.map((card, stackIndex) => renderCard(card, compact, keyPrefix, stackIndex))}
      </div>
    ));
  }

  function renderOtherPermanentStacks(permanents: CardInstance[]) {
    return permanents.map((card) => (
      <div
        key={`other-stack-${card.instanceId}`}
        className="battlefield-copy-stack battlefield-copy-stack-compact other-permanent-stack"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {renderCard(card, true, "other", 0)}
        </AnimatePresence>
      </div>
    ));
  }

  function renderCard(card: CardInstance, compact = false, keyPrefix = "card", stackIndex = 0) {
    const useNewSummoning = side !== "horde";
    const newlyArrived = !seenCardIds.current.has(card.instanceId);
    const firstTimeOnThisBattlefield = useNewSummoning && newlyArrived;
    const buffAnimationActive = Boolean(buffAnimationEventId && buffAnimationCardIds.includes(card.instanceId));
    const isOtherPermanent = keyPrefix === "other";
    const selected = side === "player" ? selectedPlayerCreatureId === card.instanceId : selectedHordeCreatureId === card.instanceId;
    const assignedAttackerId = findAssignedAttacker(card.instanceId);
    const blocking = Boolean(assignedAttackerId);
    const blockerOrderLabel = assignedAttackerId ? getBlockerOrderLabel(card.instanceId, assignedAttackerId) : undefined;
    const attacking = game.combat.playerAttackers.includes(card.instanceId) || game.combat.hordeAttackers.includes(card.instanceId);
    const attackerColor = getAttackerColor(card.instanceId);
    const assignedColor = assignedAttackerId ? getAttackerColor(assignedAttackerId) : undefined;
    const blockersAssigned = game.combat.blockers[card.instanceId]?.length ?? 0;
    const selectedBlocker = selectedPlayerCreatureId ? game.player.battlefield.find((item) => item.instanceId === selectedPlayerCreatureId) : undefined;
    const selectedBlockerAssigned = selectedBlocker ? Boolean(findAssignedAttacker(selectedBlocker.instanceId)) : false;
    const isLand = card.cardTypes.includes("Land");
    const smallpoxTargetable = Boolean(
      smallpoxSelectionActive &&
        !smallpoxSelectionTargetId &&
        side === "player" &&
        ((smallpoxSelectionKind === "sacrifice-creature" && card.cardTypes.includes("Creature")) ||
          (smallpoxSelectionKind === "sacrifice-land" && card.cardTypes.includes("Land"))),
    );
    const smallpoxTargetLocked = smallpoxSelectionTargetId === card.instanceId;
    const playerCombat = game.activeSide === "player" && game.phase === "combat";
    const selectedPlayerAttacker = game.combat.playerAttackers.includes(card.instanceId);
    const legalAttacker = Boolean(playerCombat && side === "player" && card.cardTypes.includes("Creature") && (selectedPlayerAttacker || canAttack(game, card)));
    const availablePlayerAttacker = Boolean(playerCombat && side === "player" && card.cardTypes.includes("Creature") && !selectedPlayerAttacker && canAttack(game, card));
    const legalBlocker = Boolean(
      hordeCombat &&
        side === "player" &&
        card.cardTypes.includes("Creature") &&
        !blocking &&
        game.combat.hordeAttackers.some((attackerId) => {
          const attacker = game.horde.battlefield.find((item) => item.instanceId === attackerId);
          return attacker ? canBlockAttacker(game, card, attacker) : false;
        }),
    );
    const legalBlockTarget = Boolean(hordeCombat && side === "horde" && selectedBlocker && !selectedBlockerAssigned && game.combat.hordeAttackers.includes(card.instanceId) && canBlockAttacker(game, selectedBlocker, card));
    const selectableBlocker = Boolean(hordeCombat && side === "player" && card.cardTypes.includes("Creature") && (legalBlocker || selected || blocking));
    const selectionDisabled =
      tutorialAwaitingContinue ||
      (isLand && !smallpoxTargetable && !smallpoxTargetLocked) ||
      (playerCombat && side === "player" && !legalAttacker) ||
      (playerCombat && side === "horde") ||
      (hordeCombat && side === "player" && !selectableBlocker) ||
      (hordeCombat && side === "horde" && !legalBlockTarget);
    const muted =
      (playerCombat && side === "player" && !legalAttacker && !selectedPlayerAttacker && !isLand) ||
      (playerCombat && side === "horde") ||
      (hordeCombat && side === "player" && card.cardTypes.includes("Creature") && !selectableBlocker);
    const actionable = !resolvingHordeCombat && (availablePlayerAttacker || legalBlockTarget || (legalBlocker && !selectedPlayerCreatureId));
    const effectAvailable = canUseTapActivatedAbility(card);
    const effectActive = activeEffectCardId === card.instanceId;
    const effectClosing = closingEffectCardId === card.instanceId;
    const effectActivating = activatingEffectCardId === card.instanceId;
    const primaryAbility = card.activatedAbilities.find((ability) => ability.cost?.tap === true);
    const counterTargetable = Boolean(counterTargetingActive && !counterTargetingTargetId && card.cardTypes.includes("Creature"));
    const counterTargetLocked = counterTargetingTargetId === card.instanceId;
    const spellCard = spellTargetingActive ? game.player.hand.find((item) => item.instanceId === spellTargetingHandId) : undefined;
    const spellReq = spellCard?.requiresTargets[spellTargetingStepIndex ?? 0];
    const spellTargetsComplete = Boolean(spellTargetingActive && spellCard?.requiresTargets.every((req) => Boolean(spellTargetingTargets?.[req.id])));
    const spellCandidates = spellReq ? targetCandidatesWithSelectedTargets(game, "player", spellReq, spellTargetingTargets ?? {}) : [];
    const spellTargetable = isSpellTargetable(card);
    const spellTargetLocked = isSpellTargetLocked(card);
    const spellLockedReq = spellTargetingActive
      ? spellCard?.requiresTargets.find((req) => {
          const selectedTarget = spellTargetingTargets?.[req.id];
          return Array.isArray(selectedTarget) ? selectedTarget.includes(card.instanceId) : selectedTarget === card.instanceId;
        })
      : undefined;
    const spellTargetLockedIsBuff = Boolean(spellTargetLocked && spellCard && spellLockedReq && targetRequirementIsBuff(spellCard, spellLockedReq));
    const spellLockedFriendly = Boolean(spellTargetLocked && card.controller === "player");
    const spellBuffPreview = spellLockedFriendly && spellCard && spellTargetingTargets ? spellBuffedStats(game, card, spellCard, spellTargetingTargets) : undefined;
    const tutorialTargetable = tutorialZones.some(
      (zone) =>
        (zone.zone === "player-battlefield" && side === "player" && card.definitionId === zone.definitionId) ||
        (zone.zone === "defend-targets" && ((side === "player" && card.definitionId === "ichorspit_basilisk" && legalBlocker) || (side === "horde" && game.combat.hordeAttackers.includes(card.instanceId)))),
    );
    const visuallyDead = hordeCombatDeadCardIds.includes(card.instanceId);
    const speciallyDead = specialDeadCardIds.includes(card.instanceId);
    const cardTargetable = counterTargetable || smallpoxTargetable || spellTargetable || tutorialTargetable;
    const cardActionable = !tutorialAwaitingContinue && (actionable || cardTargetable);
    const isDraggedDefender = blockDragBlockerId === card.instanceId;
    const draggedDefender = blockDragActive ? game.player.battlefield.find((item) => item.instanceId === blockDragBlockerId) : undefined;
    const dragDefenseTargetable = Boolean(
      blockDragActive &&
        draggedDefender &&
        side === "horde" &&
        game.combat.hordeAttackers.includes(card.instanceId) &&
        canBlockAttacker(game, draggedDefender, card),
    );
    const showActionGem = blockDragActive ? isDraggedDefender || dragDefenseTargetable : cardActionable || effectAvailable;
    const actionGemTone = isDraggedDefender || dragDefenseTargetable
      ? "card-defense-gem"
      : cardTargetable
      ? "card-target-gem"
      : playerCombat && actionable
        ? "card-attack-gem"
        : hordeCombat && actionable
          ? "card-defense-gem"
          : effectAvailable && !cardActionable
            ? "card-effect-available-gem"
            : "";
    const interactionElevated = Boolean(
      effectActive ||
        effectClosing ||
        effectActivating ||
        counterTargetable ||
        counterTargetLocked ||
        smallpoxTargetable ||
        smallpoxTargetLocked ||
        spellTargetable ||
        spellTargetLocked ||
        tutorialTargetable,
    );
    const isFlying = card.cardTypes.includes("Creature") && hasKeyword(game, card, "FLYING");
    const combatAnimationActive =
      playerAttackAnimationId === card.instanceId ||
      hordeAttackAnimationAttackerId === card.instanceId ||
      hordeAttackAnimationBlockerId === card.instanceId;
    const flyingIdleActive = Boolean(
      isFlying &&
        !newlyArrived &&
        !combatAnimationActive &&
        !interactionElevated &&
        !visuallyDead &&
        !speciallyDead &&
        !resolvingHordeCombat,
    );

    return (
      <motion.div
        key={`${keyPrefix}-${card.instanceId}`}
        data-card-layout-id={card.instanceId}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, y: side === "horde" ? 28 : -28, scale: 0.78, rotate: side === "horde" ? 3 : -3 }}
        transition={{
          opacity: { duration: 0.18, ease: "easeOut" },
          scale: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
          rotate: { duration: 0.28, ease: "easeOut" },
          filter: { duration: 0.36, ease: "easeOut" },
        }}
        className={[
          "battlefield-layout-slot",
          interactionElevated ? "battlefield-layout-slot-elevated" : "",
          card.tapped ? "battlefield-layout-slot-tapped" : "",
          card.cardTypes.includes("Creature") ? "battlefield-layout-slot-creature-clearance" : "",
        ].join(" ")}
        style={{ "--copy-stack-index": stackIndex + 1 } as CSSProperties}
      >
      <div className="battlefield-card-reflow" data-card-reflow-id={card.instanceId}>
      <div
        data-card-slot-id={card.instanceId}
        data-summoning={useNewSummoning && firstTimeOnThisBattlefield ? "true" : undefined}
        data-entry-delay={0}
        style={isFlying ? flyingIdleVariables(card.instanceId) : undefined}
        className={[
          compact ? "battlefield-card-slot-compact" : "battlefield-card-slot",
          isFlying ? "battlefield-card-flying" : "",
          flyingIdleActive ? "battlefield-card-flying-idle" : "",
          isOtherPermanent ? "battlefield-other-permanent-slot" : "",
          isLand ? "battlefield-land-slot" : "",
          selected ? "battlefield-card-selected" : "",
          actionable ? "battlefield-card-actionable" : "",
          effectAvailable && !actionable ? "battlefield-card-effect-available" : "",
          side === "player" && attacking ? "player-attacker-readied" : "",
          side === "horde" && attacking ? "horde-attacker-readied" : "",
          visuallyDead ? "combat-card-visually-dead" : "",
          speciallyDead ? "special-card-visually-dead" : "",
          effectActive ? "effect-card-lifted" : "",
          effectClosing ? "effect-card-closing" : "",
          effectActivating ? "effect-card-activating" : "",
          counterTargetable ? "counter-targetable-card" : "",
          counterTargetLocked ? "counter-target-locked-card" : "",
          smallpoxTargetable ? "counter-targetable-card" : "",
          smallpoxTargetLocked ? "counter-target-locked-card" : "",
          spellTargetable ? "spell-targetable-card" : "",
          spellTargetLocked ? (spellTargetLockedIsBuff ? "spell-target-locked-card spell-target-locked-buff" : "spell-target-locked-card spell-target-locked-attack") : "",
          tutorialTargetable ? "counter-targetable-card" : "",
        ].join(" ")}
      >
      {isFlying && <span className="battlefield-flight-shadow" aria-hidden="true" />}
      {isFlying && <span className="battlefield-flight-wisp" aria-hidden="true" />}
      <span className="battlefield-card-depth" aria-hidden="true" />
      {buffAnimationActive && <span key={`buff-${buffAnimationEventId}`} className="buff-rise-lines buff-rise-lines-blue" aria-hidden="true" />}
      {isOtherPermanent && newlyArrived && <span className="other-permanent-arrival-glow" aria-hidden="true" />}
      <Card
        game={game}
        card={card}
        compact={compact}
        cropTopHalf={isLand}
        selected={selected}
        attacking={attacking}
        blocking={blocking}
        glowBorderWidth={4}
        actionable={cardActionable}
        effectAvailable={effectAvailable}
        accentColor={side === "player" && !hordeCombat ? assignedColor ?? attackerColor : undefined}
        linkLabel={side === "player" && blockerOrderLabel ? blockerOrderLabel : side === "horde" && blockersAssigned > 0 ? `${blockersAssigned}` : undefined}
        selectionDisabled={selectionDisabled}
        muted={muted}
        suppressContextMenu={effectActive || counterTargetingActive || spellTargetingActive || smallpoxSelectionActive}
        suppressHoverOverlay={spellTargetingActive || smallpoxSelectionActive || Boolean(tutorialStepId)}
        visualDamageMarked={hordeCombatVisualDamage?.[card.instanceId]}
        onPointerDown={(event) => {
          if (tutorialAwaitingContinue) return;
          if (legalAttacker && side === "player" && event.button === 0) {
            beginPlayerAttackDrag(card.instanceId, event);
            return;
          }
          if (!selectableBlocker || event.button !== 0) return;
          beginBlockDrag(card.instanceId, event);
        }}
        onContextMenu={() => {
          if (!effectActive) return;
          selectActiveEffectCard(undefined);
        }}
        shouldSuppressClick={() => {
          if (!suppressNextSelectIds.current.has(card.instanceId)) return false;
          suppressNextSelectIds.current.delete(card.instanceId);
          return true;
        }}
        onSelect={() => {
          if (tutorialAwaitingContinue) return;
          if (smallpoxSelectionActive) {
            if (smallpoxTargetable) lockSmallpoxSelectionTarget(card.instanceId);
            return;
          }
          if (counterTargetingActive) {
            if (counterTargetable) lockCounterTarget(card.instanceId);
            return;
          }
          if (side === "player") {
            if (isLand) return;
            if (!hordeCombat && !playerCombat && effectAvailable) {
              selectActiveEffectCard(effectActive ? undefined : card.instanceId);
              selectPlayerCreature(undefined);
              return;
            }
            if (hordeCombat) {
              if (assignedAttackerId) {
                declareBlocker(card.instanceId, assignedAttackerId);
                selectPlayerCreature(card.instanceId);
                return;
              }
              selectPlayerCreature(selected ? undefined : card.instanceId);
              return;
            }
            if (playerCombat) {
              toggleAttacker(card.instanceId);
              return;
            }
            selectPlayerCreature(card.instanceId);
          } else {
            if (hordeCombat && selectedPlayerCreatureId && game.combat.hordeAttackers.includes(card.instanceId)) {
              declareBlocker(selectedPlayerCreatureId, card.instanceId);
              selectPlayerCreature(undefined);
              return;
            }
            selectHordeCreature(card.instanceId);
          }
        }}
      />
      {showActionGem && (
        <span
          className={[
            "card-actionable-gem card-actionable-gem-outside",
            actionGemTone,
            dragDefenseTargetable ? "card-defense-gem-horde-target" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      )}
      {effectActive && primaryAbility && (
        <button
          data-audio-click="valid"
          className="effect-action-button"
          onClick={(event) => {
            event.stopPropagation();
            selectActiveEffectCard(undefined);
            window.setTimeout(() => {
              useAudioStore.getState().playSfx("activateEffect", { volume: 0.85 });
              triggerEffectActivationPulse(card.instanceId);
            }, 180);
            window.setTimeout(() => {
              useAudioStore.getState().playSfx("playLand", { volume: 0.78 });
              activateAbility(card.instanceId, primaryAbility.id);
            }, 620);
          }}
        >
          <span className="effect-action-copy">
            <strong>{renderCardText(abilityButtonText(primaryAbility))}</strong>
          </span>
        </button>
      )}
      {counterTargetLocked && <span className="counter-target-stat-preview">{counterBuffedStats(game, card)}</span>}
      {spellBuffPreview && <span className="counter-target-stat-preview">{spellBuffPreview}</span>}
      </div>
      </div>
      </motion.div>
    );
  }

  function findAssignedAttacker(blockerId: string): string | undefined {
    return Object.entries(game.combat.blockers).find(([, blockerIds]) => blockerIds.includes(blockerId))?.[0];
  }

  function isSpellTargetable(card: CardInstance): boolean {
    const spellCard = spellTargetingActive ? game.player.hand.find((item) => item.instanceId === spellTargetingHandId) : undefined;
    const spellReq = spellCard?.requiresTargets[spellTargetingStepIndex ?? 0];
    const spellTargetsComplete = Boolean(spellTargetingActive && spellCard?.requiresTargets.every((req) => Boolean(spellTargetingTargets?.[req.id])));
    const spellCandidates = spellReq ? targetCandidatesWithSelectedTargets(game, "player", spellReq, spellTargetingTargets ?? {}) : [];
    return Boolean(
      spellTargetingActive &&
        !spellTargetsComplete &&
        spellReq &&
        spellCandidates.some((candidate) => candidate.instanceId === card.instanceId) &&
        !Object.values(spellTargetingTargets ?? {}).includes(card.instanceId),
    );
  }

  function isSpellTargetLocked(card: CardInstance): boolean {
    return Boolean(spellTargetingActive && Object.values(spellTargetingTargets ?? {}).includes(card.instanceId));
  }

  function getBlockerOrderLabel(blockerId: string, attackerId: string): string | undefined {
    const orderedBlockers = game.combat.blockers[attackerId] ?? [];
    const orderIndex = orderedBlockers.indexOf(blockerId);
    return orderIndex >= 0 ? `${orderIndex + 1}` : undefined;
  }

  function getAttackerColor(attackerId: string): string | undefined {
    const index = game.combat.hordeAttackers.indexOf(attackerId);
    if (index === -1) return undefined;
    return blockColors[index % blockColors.length];
  }

  function hordeEntryDelay(card: CardInstance): number {
    const index = cards.findIndex((item) => item.instanceId === card.instanceId);
    return Math.max(index, 0) * 0.04;
  }

  function canUseTapActivatedAbility(card: CardInstance): boolean {
    if (spellTargetingActive) return false;
    if (game.activeSide !== "player" || game.phase !== "main") return false;
    if (side !== "player") return false;
    if (card.zone !== "battlefield") return false;
    if (card.tapped) return false;
    if (card.activatedThisTurn) return false;
    if (card.summoningSickness && card.cardTypes.includes("Creature")) return false;
    return card.activatedAbilities.some((ability) => ability.cost?.tap === true);
  }

  function beginBlockDrag(blockerId: string, event: PointerEvent<HTMLElement>): void {
    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    function suppressNextClickSelection() {
      suppressNextSelectIds.current.add(blockerId);
      window.setTimeout(() => suppressNextSelectIds.current.delete(blockerId), 80);
    }

    function handlePointerMove(moveEvent: PointerEventEvent) {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragStarted && distance < BLOCK_DRAG_THRESHOLD_PX) return;
      if (!dragStarted) {
        dragStarted = true;
        startBlockDrag(blockerId, startX, startY);
      }
      updateBlockDrag(moveEvent.clientX, moveEvent.clientY);
    }

    function handlePointerUp(upEvent: PointerEventEvent) {
      if (dragStarted) {
        suppressNextClickSelection();
        const dropResult = findDropBlockTarget(upEvent.clientX, upEvent.clientY, blockerId);
        if (dropResult.attackerId) {
          const latest = useGameStore.getState().game;
          const currentAttackerId = Object.entries(latest.combat.blockers).find(([, blockerIds]) => blockerIds.includes(blockerId))?.[0];
          if (currentAttackerId && currentAttackerId !== dropResult.attackerId) {
            useGameStore.getState().declareBlocker(blockerId, currentAttackerId);
          }
          useGameStore.getState().declareBlocker(blockerId, dropResult.attackerId);
          useGameStore.getState().selectPlayerCreature(undefined);
        } else {
          if (dropResult.reason) showBlockToast(dropResult.reason);
          cancelBlockDrag();
        }
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function beginPlayerAttackDrag(attackerId: string, event: PointerEvent<HTMLElement>): void {
    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    function suppressNextClickSelection() {
      suppressNextSelectIds.current.add(attackerId);
      window.setTimeout(() => suppressNextSelectIds.current.delete(attackerId), 80);
    }

    function handlePointerMove(moveEvent: PointerEventEvent) {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragStarted && distance < PLAYER_ATTACK_DRAG_THRESHOLD_PX) return;
      if (!dragStarted) {
        dragStarted = true;
        startPlayerAttackDrag(attackerId, startX, startY);
      }
      updatePlayerAttackDrag(moveEvent.clientX, moveEvent.clientY);
    }

    function handlePointerUp(upEvent: PointerEventEvent) {
      if (dragStarted) {
        suppressNextClickSelection();
        if (isPlayerAttackDropTarget(upEvent.clientX, upEvent.clientY)) {
          const latest = useGameStore.getState().game;
          const alreadyAttacking = latest.combat.playerAttackers.includes(attackerId);
          useGameStore.getState().cancelPlayerAttackDrag();
          if (!alreadyAttacking) useGameStore.getState().toggleAttacker(attackerId);
          else useGameStore.getState().cancelPlayerAttackDrag();
        } else {
          cancelPlayerAttackDrag();
        }
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }
}

function groupBattlefieldCopies(
  game: GameState,
  cards: CardInstance[],
  cardOrder: Map<string, number>,
  familyOrder: Map<string, number>,
  zombieWaveByCardId: Map<string, number>,
  zombieWaveOrder: Map<number, number>,
  keepSeparateCardIds?: Set<string>,
): Array<{ key: string; cards: CardInstance[] }> {
  const groups = new Map<string, { cards: CardInstance[]; order: number; suborder: number }>();
  const stackZombieTokens = cards.length > 7;

  for (const card of cards) {
    const zombieToken = isZombieToken(card);
    const stats = cardStatState(game, card);
    const visualStatsKey = `${stats.text}-${stats.damaged ? "damaged" : "healthy"}-${stats.buffed ? "buffed" : "base"}`;
    const zombieWaveId = zombieWaveByCardId.get(card.instanceId);
    const groupingKey =
      keepSeparateCardIds?.has(card.instanceId)
        ? `pending-trigger-${card.instanceId}`
        : zombieToken && !stackZombieTokens
        ? `instance-${card.instanceId}`
        : zombieToken
          ? `zombie-wave-${zombieWaveId ?? card.instanceId}-${card.definitionId}-${visualStatsKey}`
          : `copy-${card.definitionId}-${visualStatsKey}`;
    const instanceOrder = cardOrder.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER;
    const order = zombieToken
      ? zombieWaveId === undefined
        ? instanceOrder
        : (zombieWaveOrder.get(zombieWaveId) ?? instanceOrder)
      : (familyOrder.get(card.definitionId) ?? instanceOrder);
    const group = groups.get(groupingKey);
    if (group) {
      group.cards.push(card);
      group.suborder = Math.min(group.suborder, instanceOrder);
    } else {
      groups.set(groupingKey, { cards: [card], order, suborder: instanceOrder });
    }
  }

  return Array.from(groups.values())
    .sort((left, right) => left.order - right.order || left.suborder - right.suborder)
    .map(({ cards: groupedCards }) => {
      // The visual grouping criteria can change when a trigger alters a creature's stats.
      // Anchor the React key to the oldest member instead of those volatile stats; otherwise
      // a newly-cast base copy can inherit the old group's key while the existing buffed copy
      // is remounted in a new group, which looks like a brief stack-then-destack jump.
      const anchor = groupedCards.reduce((oldest, card) =>
        (cardOrder.get(card.instanceId) ?? Number.MAX_SAFE_INTEGER) < (cardOrder.get(oldest.instanceId) ?? Number.MAX_SAFE_INTEGER) ? card : oldest,
      );
      return { key: `anchor-${anchor.instanceId}`, cards: groupedCards };
    });
}

function isZombieToken(card: CardInstance): boolean {
  return card.isToken && card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie");
}

function flyingIdleVariables(instanceId: string): CSSProperties {
  let hash = 0;
  for (const character of instanceId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const duration = 3600 + (hash % 900);
  const delay = -(hash % duration);
  const drift = hash % 2 === 0 ? 1.5 : -1.5;
  return {
    "--flying-idle-duration": `${duration}ms`,
    "--flying-idle-delay": `${delay}ms`,
    "--flying-idle-drift": `${drift}px`,
  } as CSSProperties;
}

function counterBuffedStats(game: GameState, card: CardInstance): string {
  const stats = getPowerToughness(game, card);
  return `${stats.power + 1}/${stats.toughness + 1}`;
}

function spellBuffedStats(game: GameState, card: CardInstance, spell: CardInstance, targets: Record<string, string | string[]>): string | undefined {
  const stats = getPowerToughness(game, card);
  let powerDelta = 0;
  let toughnessDelta = 0;

  function collect(effect: CardInstance["effects"][number]) {
    if (effect.type === "MODIFY_STATS" || effect.type === "PUMP" || effect.type === "PUMP_UNTIL_END_OF_TURN") {
      const targetRef = typeof effect.targetRef === "string" ? effect.targetRef : typeof effect.target === "string" ? effect.target : undefined;
      const selected = targetRef ? targets[targetRef] : undefined;
      const applies = Array.isArray(selected) ? selected.includes(card.instanceId) : selected === card.instanceId;
      if (applies) {
        powerDelta += Number(effect.power) || 0;
        toughnessDelta += Number(effect.toughness) || 0;
      }
    }
    if (Array.isArray(effect.effects)) {
      for (const nested of effect.effects) collect(nested as CardInstance["effects"][number]);
    }
  }

  for (const effect of spell.effects) collect(effect);
  if (powerDelta === 0 && toughnessDelta === 0) return undefined;
  return `${stats.power + powerDelta}/${stats.toughness + toughnessDelta}`;
}

function abilityButtonText(ability: CardInstance["activatedAbilities"][number]): string {
  if (ability.effect.type === "ADD_MANA" || ability.effect.type === "ADD_MANA_DYNAMIC") {
    const mana = ability.effect.mana as Record<string, number> | undefined;
    const entry = mana ? Object.entries(mana)[0] : undefined;
    const color = entry?.[0] === "chosenColor" ? "chosen" : entry?.[0] ?? String(ability.effect.manaColor ?? "G");
    const amount = Number(entry?.[1] ?? ability.effect.amount ?? 1);
    return `{{T}}: Add ${amount > 1 ? amount : ""}{{${color}}}.`;
  }
  return String(ability.effect.type).replaceAll("_", " ");
}

type PointerEventEvent = globalThis.PointerEvent;

function findDropBlockTarget(x: number, y: number, blockerId: string): { attackerId?: string; reason?: string } {
  const latest = useGameStore.getState().game;
  const blocker = latest.player.battlefield.find((card) => card.instanceId === blockerId);
  if (!blocker) return {};
  for (const element of document.elementsFromPoint(x, y)) {
    const cardElement = element.closest<HTMLElement>("[data-card-id]");
    const candidateId = cardElement?.dataset.cardId;
    if (!candidateId || !latest.combat.hordeAttackers.includes(candidateId)) continue;
    const attacker = latest.horde.battlefield.find((card) => card.instanceId === candidateId);
    if (!attacker) continue;
    const reason = blockRestrictionReason(latest, blocker, attacker);
    return reason ? { reason } : { attackerId: candidateId };
  }
  return {};
}

function showBlockToast(message: string): void {
  const language = useLanguageStore.getState().language;
  const localizedMessage = message === "That creature cannot block."
    ? translate(language, "error.creatureCannotBlock")
    : message === "Flying attackers need flying or reach to block."
      ? translate(language, "error.flyingBlock")
      : message;
  useToastStore.getState().pushToast({
    title: translate(language, "error.cannotBlock"),
    message: localizedMessage,
    tone: "warning",
  });
}

function isPlayerAttackDropTarget(x: number, y: number): boolean {
  return document.elementsFromPoint(x, y).some((element) => Boolean(element.closest<HTMLElement>("[data-battlefield-drop-target='player-attack']")));
}

function animateReadiedShift(element: HTMLElement, forward: boolean): void {
  element.animate([{ top: forward ? "0px" : "-18px" }, { top: forward ? "-18px" : "0px" }], {
    duration: 220,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  });
}

// Groups vertical positions into row "bands" so the creature row's line count can be
// compared before/after a render (used to tell whether a summon just wrapped the row).
function countRowBands(tops: number[]): number {
  if (tops.length === 0) return 0;
  const sorted = [...tops].sort((a, b) => a - b);
  let bands = 1;
  let bandTop = sorted[0];
  for (const top of sorted.slice(1)) {
    if (top - bandTop > 16) {
      bands += 1;
      bandTop = top;
    }
  }
  return bands;
}
