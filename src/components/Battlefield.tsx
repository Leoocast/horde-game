import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { blockRestrictionReason, canAttack, canBlockAttacker } from "../engine/Keywords";
import { targetCandidatesWithSelectedTargets } from "../engine/Targeting";
import { getPowerToughness } from "../engine/StaticEffects";
import { getTutorialSpotlightZones, getTutorialStepId, isTutorialAwaitingContinue, isTutorialSeed } from "../engine/Tutorial";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { useToastStore } from "../store/useToastStore";
import { renderCardText } from "../utils/cardTextSymbols";
import { Card } from "./Card";
import { Zone } from "./Zone";
import { AnimatePresence, motion } from "framer-motion";
import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";

type Props = {
  game: GameState;
  side: Side;
  cards: CardInstance[];
};

const blockColors = ["#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6", "#818cf8"];
const BLOCK_DRAG_THRESHOLD_PX = 9;
const PLAYER_ATTACK_DRAG_THRESHOLD_PX = 9;

export function Battlefield({ game, side, cards }: Props) {
  const seenCardIds = useRef<Set<string>>(new Set(cards.map((card) => card.instanceId)));
  const animatedHordeIds = useRef<Set<string>>(new Set());
  const seenAutoPaidEvents = useRef<Set<number>>(new Set());
  const seenBuffEvents = useRef<Set<number>>(new Set());
  const boardRef = useRef<HTMLDivElement>(null);
  const landDockRef = useRef<HTMLElement>(null);
  const previousRects = useRef<Map<string, DOMRect>>(new Map());
  const previousLayoutSignature = useRef(cards.map((card) => card.instanceId).join("|"));
  const previousHordeEntrySignature = useRef(cards.map((card) => card.instanceId).join("|"));
  const previousPlayerAttackers = useRef<Set<string>>(new Set());
  const suppressNextSelectIds = useRef<Set<string>>(new Set());
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const resolvingHordeCombat = useGameStore((state) => state.resolvingHordeCombat);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const activatingEffectCardId = useGameStore((state) => state.activatingEffectCardId);
  const counterTargeting = useGameStore((state) => state.counterTargeting);
  const smallpoxSelection = useGameStore((state) => state.smallpoxSelection);
  const spellTargeting = useGameStore((state) => state.spellTargeting);
  const buffAnimationCardIds = useGameStore((state) => state.buffAnimationCardIds);
  const buffAnimationEventId = useGameStore((state) => state.buffAnimationEventId);
  const hordeCombatVisualDamage = useGameStore((state) => state.hordeCombatVisualDamage);
  const hordeCombatDeadCardIds = useGameStore((state) => state.hordeCombatDeadCardIds);
  const specialDeadCardIds = useGameStore((state) => state.specialDeadCardIds);
  const autoPaidLandAnimation = useGameStore((state) => state.autoPaidLandAnimation);
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
    if (!buffAnimationEventId || seenBuffEvents.current.has(buffAnimationEventId)) return;
    const root = boardRef.current;
    if (!root) return;

    seenBuffEvents.current.add(buffAnimationEventId);
    for (const id of buffAnimationCardIds) {
      const slot = root.querySelector<HTMLElement>(`[data-card-slot-id="${id}"]`) ?? landDockRef.current?.querySelector<HTMLElement>(`[data-card-slot-id="${id}"]`);
      if (!slot) continue;
      const layer = document.createElement("span");
      layer.className = "buff-rise-lines buff-rise-lines-blue";
      layer.setAttribute("aria-hidden", "true");
      slot.appendChild(layer);
      window.setTimeout(() => layer.remove(), 1040);
    }
  }, [buffAnimationCardIds, buffAnimationEventId]);

  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return;

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
            delay: hordeEntryDelay(card) * 1000,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        );
        animation.onfinish = () => {
          visual.style.opacity = "";
          visual.style.transform = "";
          visual.style.filter = "";
        };
      }
    }
    if (side === "horde") previousHordeEntrySignature.current = currentHordeEntrySignature;

    const summoningElements = Array.from(root.querySelectorAll<HTMLElement>("[data-summoning='true']"));
    for (const visual of summoningElements) {
      const id = visual.dataset.cardSlotId;
      if (id) seenCardIds.current.add(id);
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
          delay: Number(visual.dataset.entryDelay ?? 0) * 1000,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
      );
      animation.onfinish = () => {
        if (side === "player") endSummoningAnimation();
      };
      visual.removeAttribute("data-summoning");
    }

    const layoutSignature = cards.map((card) => card.instanceId).join("|");
    const shouldAnimateLayout = previousLayoutSignature.current !== layoutSignature;
    const nextRects = new Map<string, DOMRect>();
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-card-layout-id]"));
    for (const element of elements) {
      const id = element.dataset.cardLayoutId;
      if (!id) continue;
      nextRects.set(id, element.getBoundingClientRect());
    }

    if (shouldAnimateLayout) {
      for (const element of elements) {
        const id = element.dataset.cardLayoutId;
        if (!id) continue;
        const previous = previousRects.current.get(id);
        const current = nextRects.get(id);
        if (!previous || !current) continue;

        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

        const visual = element.querySelector<HTMLElement>("[data-card-slot-id]");
        if (!visual || visual.style.visibility === "hidden") continue;
        visual.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }], {
          duration: 360,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
      }
    }

    previousRects.current = nextRects;
    previousLayoutSignature.current = layoutSignature;
  });

  return (
    <>
      <Zone title={side === "player" ? "Player Battlefield" : "Horde Battlefield"} count={side === "player" ? creatures.length + others.length : cards.length}>
        <div ref={boardRef} className="battlefield-side-content">
          {others.length > 0 ? (
            <PermanentBattlefieldRow creatures={creatures} others={others} dropTarget={side === "horde" ? "player-attack" : undefined} />
          ) : (
            <BattlefieldRow title="Creatures" cards={creatures} dropTarget={side === "horde" ? "player-attack" : undefined} />
          )}
        </div>
      </Zone>
      {side === "player" && createPortal(<LandDock />, document.body)}
    </>
  );

  function BattlefieldRow({ title, cards: rowCards, compact = false, dropTarget }: { title: string; cards: CardInstance[]; compact?: boolean; dropTarget?: string }) {
    return (
      <div data-battlefield-drop-target={dropTarget} className="old-panel-soft relative p-1.5">
        <div className="pointer-events-none absolute left-2 right-2 top-1 z-10 flex h-4 items-center justify-between leading-none">
          <h3 className="old-title text-[10px] font-bold uppercase tracking-wide">{title}</h3>
          <span className="text-[10px] font-semibold text-[#d6b879]">{rowCards.length}</span>
        </div>
        {rowCards.length === 0 ? (
          <div className={["battlefield-row-surface", compact ? "battlefield-empty-compact" : "battlefield-empty"].join(" ")}>Empty</div>
        ) : (
          <div className={["battlefield-row-surface flex flex-wrap items-center justify-center gap-2", compact ? "battlefield-row-body-compact" : "battlefield-row-body"].join(" ")}>
            <AnimatePresence initial={false} mode="popLayout">
              {renderCardStacks(rowCards, compact, "creature")}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  function PermanentBattlefieldRow({ creatures: rowCreatures, others: rowOthers, dropTarget }: { creatures: CardInstance[]; others: CardInstance[]; dropTarget?: string }) {
    const otherPermanentsTargetingActive = rowOthers.some((card) => isSpellTargetable(card) || isSpellTargetLocked(card));

    return (
      <div data-battlefield-drop-target={dropTarget} className="old-panel-soft relative p-1.5">
        <div className="pointer-events-none absolute left-2 right-2 top-1 z-10 flex h-4 items-center justify-between leading-none">
          <h3 className="old-title text-[10px] font-bold uppercase tracking-wide">Creatures</h3>
          <span className="text-[10px] font-semibold text-[#d6b879]">{rowCreatures.length}</span>
        </div>
        {rowCreatures.length === 0 ? (
          <div className="battlefield-empty battlefield-row-surface">Empty</div>
        ) : (
          <div className="battlefield-row-body battlefield-row-surface flex flex-wrap items-center justify-center gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {renderCardStacks(rowCreatures, false, "creature")}
            </AnimatePresence>
          </div>
        )}
        <div className={["absolute left-1.5 top-6", otherPermanentsTargetingActive ? "z-[96]" : "z-20"].join(" ")}>
          <div className="old-panel-soft w-max p-1">
            <div className="mb-1 flex h-4 items-center justify-between gap-4 leading-none">
              <h3 className="old-title text-[10px] font-bold uppercase tracking-wide">Other permanents</h3>
              <span className="text-[10px] font-semibold text-[#d6b879]">{rowOthers.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {rowOthers.map((card) => renderCard(card, true, "other"))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function LandDock() {
    const landCount = lands.length;
    const columns = landCount >= 9 ? 5 : Math.min(Math.max(landCount, 1), 4);
    const cardWidth = landCount <= 1 ? 120 : landCount <= 2 ? 105 : 88;
    const fillsRow = landCount >= 4;
    const smallpoxLandSelectionActive = smallpoxSelection?.kind === "sacrifice-land";
    const dockStyle = {
      "--player-land-columns": columns,
      "--battlefield-compact-card-width": `${cardWidth}px`,
    } as CSSProperties;

    return (
      <aside ref={landDockRef} className={["old-panel player-land-dock", smallpoxLandSelectionActive ? "player-land-dock-targeting" : ""].join(" ")} style={dockStyle}>
        <div className="player-land-dock-header">
          <h3 className="old-title text-[10px] font-bold uppercase tracking-wide">Lands</h3>
          <span className="text-[10px] font-semibold text-[#d6b879]">{landCount}</span>
        </div>
        {landCount === 0 ? (
          <div className="player-land-dock-empty battlefield-row-surface">Empty</div>
        ) : (
          <div className={["player-land-grid battlefield-row-surface", fillsRow ? "player-land-grid-fill" : ""].join(" ")}>
            <AnimatePresence initial={false} mode="popLayout">
              {lands.map((card) => renderCard(card, true, "land-dock"))}
            </AnimatePresence>
          </div>
        )}
      </aside>
    );
  }

  function renderCardStacks(rowCards: CardInstance[], compact = false, keyPrefix = "card") {
    return groupBattlefieldCopies(rowCards).map((group) => (
      <motion.div
        key={`${keyPrefix}-stack-${group.key}`}
        layout="position"
        className={["battlefield-copy-stack", compact ? "battlefield-copy-stack-compact" : ""].join(" ")}
        data-stacked={group.cards.length > 1 ? "true" : undefined}
        transition={{ layout: { type: "spring", stiffness: 700, damping: 50, mass: 0.4 } }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {group.cards.map((card, stackIndex) => renderCard(card, compact, keyPrefix, stackIndex))}
        </AnimatePresence>
      </motion.div>
    ));
  }

  function renderCard(card: CardInstance, compact = false, keyPrefix = "card", stackIndex = 0) {
    const useNewSummoning = side !== "horde";
    const firstTimeOnThisBattlefield = useNewSummoning && !seenCardIds.current.has(card.instanceId);
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
      smallpoxSelection &&
        !smallpoxSelection.targetId &&
        side === "player" &&
        ((smallpoxSelection.kind === "sacrifice-creature" && card.cardTypes.includes("Creature")) ||
          (smallpoxSelection.kind === "sacrifice-land" && card.cardTypes.includes("Land"))),
    );
    const smallpoxTargetLocked = smallpoxSelection?.targetId === card.instanceId;
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
      (playerCombat && side === "horde");
    const actionable = !resolvingHordeCombat && (availablePlayerAttacker || legalBlockTarget || (legalBlocker && !selectedPlayerCreatureId));
    const effectAvailable = canUseTapActivatedAbility(card);
    const effectActive = activeEffectCardId === card.instanceId;
    const effectClosing = closingEffectCardId === card.instanceId;
    const effectActivating = activatingEffectCardId === card.instanceId;
    const primaryAbility = card.activatedAbilities.find((ability) => ability.cost?.tap === true);
    const counterTargetable = Boolean(counterTargeting && !counterTargeting.targetId && card.cardTypes.includes("Creature"));
    const counterTargetLocked = counterTargeting?.targetId === card.instanceId;
    const spellCard = spellTargeting ? game.player.hand.find((item) => item.instanceId === spellTargeting.handId) : undefined;
    const spellReq = spellCard?.requiresTargets[spellTargeting?.stepIndex ?? 0];
    const spellTargetsComplete = Boolean(spellTargeting && spellCard?.requiresTargets.every((req) => Boolean(spellTargeting.targets[req.id])));
    const spellCandidates = spellReq ? targetCandidatesWithSelectedTargets(game, "player", spellReq, spellTargeting?.targets ?? {}) : [];
    const spellTargetable = isSpellTargetable(card);
    const spellTargetLocked = isSpellTargetLocked(card);
    const spellLockedFriendly = Boolean(spellTargetLocked && card.controller === "player");
    const tutorialTargetable = tutorialZones.some(
      (zone) =>
        (zone.zone === "player-battlefield" && side === "player" && card.definitionId === zone.definitionId) ||
        (zone.zone === "defend-targets" && ((side === "player" && card.definitionId === "ichorspit_basilisk") || (side === "horde" && game.combat.hordeAttackers.includes(card.instanceId)))),
    );
    const visuallyDead = hordeCombatDeadCardIds.includes(card.instanceId);
    const speciallyDead = specialDeadCardIds.includes(card.instanceId);

    return (
      <motion.div
        key={`${keyPrefix}-${card.instanceId}`}
        data-card-layout-id={card.instanceId}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, y: side === "horde" ? 28 : -28, scale: 0.78, rotate: side === "horde" ? 3 : -3 }}
        transition={{
          layout: { type: "spring", stiffness: 760, damping: 54, mass: 0.38 },
          opacity: { duration: 0.18, ease: "easeOut" },
          scale: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
          rotate: { duration: 0.28, ease: "easeOut" },
          filter: { duration: 0.36, ease: "easeOut" },
        }}
        className="battlefield-layout-slot"
        style={{ "--copy-stack-index": stackIndex + 1 } as CSSProperties}
      >
      <div
        data-card-slot-id={card.instanceId}
        data-summoning={useNewSummoning && firstTimeOnThisBattlefield ? "true" : undefined}
        data-entry-delay={0}
        className={[
          compact ? "battlefield-card-slot-compact" : "battlefield-card-slot",
          isLand ? "battlefield-land-slot" : "",
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
          spellTargetLocked ? `spell-target-locked-card spell-target-locked-${card.controller === "player" ? "friendly" : "enemy"}` : "",
          tutorialTargetable ? "counter-targetable-card" : "",
        ].join(" ")}
      >
      <Card
        game={game}
        card={card}
        compact={compact}
        cropTopHalf={isLand}
        selected={selected}
        attacking={attacking}
        blocking={blocking}
        actionable={!tutorialAwaitingContinue && (actionable || counterTargetable || smallpoxTargetable || tutorialTargetable)}
        effectAvailable={effectAvailable}
        accentColor={side === "player" && !hordeCombat ? assignedColor ?? attackerColor : undefined}
        linkLabel={side === "player" && blockerOrderLabel ? blockerOrderLabel : side === "horde" && blockersAssigned > 0 ? `${blockersAssigned}` : undefined}
        selectionDisabled={selectionDisabled}
        muted={muted}
        suppressContextMenu={effectActive || Boolean(counterTargeting) || Boolean(spellTargeting) || Boolean(smallpoxSelection)}
        suppressHoverOverlay={Boolean(spellTargeting) || Boolean(smallpoxSelection) || Boolean(tutorialStepId)}
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
          if (smallpoxSelection) {
            if (smallpoxTargetable) lockSmallpoxSelectionTarget(card.instanceId);
            return;
          }
          if (counterTargeting) {
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
          {renderCardText(abilityButtonText(primaryAbility))}
        </button>
      )}
      {(counterTargetLocked || spellLockedFriendly) && <span className="counter-target-stat-preview">{buffedStats(game, card)}</span>}
      </div>
      </motion.div>
    );
  }

  function findAssignedAttacker(blockerId: string): string | undefined {
    return Object.entries(game.combat.blockers).find(([, blockerIds]) => blockerIds.includes(blockerId))?.[0];
  }

  function isSpellTargetable(card: CardInstance): boolean {
    const spellCard = spellTargeting ? game.player.hand.find((item) => item.instanceId === spellTargeting.handId) : undefined;
    const spellReq = spellCard?.requiresTargets[spellTargeting?.stepIndex ?? 0];
    const spellTargetsComplete = Boolean(spellTargeting && spellCard?.requiresTargets.every((req) => Boolean(spellTargeting.targets[req.id])));
    const spellCandidates = spellReq ? targetCandidatesWithSelectedTargets(game, "player", spellReq, spellTargeting?.targets ?? {}) : [];
    return Boolean(spellTargeting && !spellTargetsComplete && spellReq && spellCandidates.some((candidate) => candidate.instanceId === card.instanceId) && !Object.values(spellTargeting.targets).includes(card.instanceId));
  }

  function isSpellTargetLocked(card: CardInstance): boolean {
    return Boolean(spellTargeting && Object.values(spellTargeting.targets).includes(card.instanceId));
  }

  function getBlockerOrderLabel(blockerId: string, attackerId: string): string | undefined {
    const orderedBlockers = game.combat.blockers[attackerId] ?? [];
    if (orderedBlockers.length < 2) return undefined;
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
    if (spellTargeting) return false;
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

function groupBattlefieldCopies(cards: CardInstance[]): Array<{ key: string; cards: CardInstance[] }> {
  const groups = new Map<string, CardInstance[]>();
  const stackZombieTokens = cards.length > 7;

  for (const card of cards) {
    const isZombieToken = card.isToken && card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie");
    const key = isZombieToken && !stackZombieTokens ? `instance-${card.instanceId}` : `copy-${card.definitionId}`;
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }

  return Array.from(groups, ([key, groupedCards]) => ({ key, cards: groupedCards }));
}

function buffedStats(game: GameState, card: CardInstance): string {
  const stats = getPowerToughness(game, card);
  return `${stats.power + 1}/${stats.toughness + 1}`;
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
  useToastStore.getState().pushToast({
    title: "Cannot block",
    message,
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
