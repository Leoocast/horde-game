import { Archive, Check, Droplet, Heart, Skull, Swords } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { previewPlayerAttackDrain } from "../engine/CombatResolver";
import { getPowerEndurance } from "../engine/StaticEffects";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";
import { useGameStore } from "../store/useGameStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";
import { GameTooltip } from "./GameTooltip";
import { GraveyardViewerModal } from "./GraveyardViewerModal";
import { hostAttackPlayerHitDelay } from "./hostAttackPresentation";
import { remainingArchiveDiscardPreview } from "./hostArchiveCounter";
import { playerAttackHostHitDelay } from "./playerAttackPresentation";

export function DuelHud({ game }: { game: GameState }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const hostMillQueue = useGameStore((state) => state.hostMillAnimationQueue);
  const hostMillPreviewCards = useGameStore((state) => state.hostMillPreviewCards);
  const tributeOfTheFourSorrowsCard = useGameStore((state) => state.tributeOfTheFourSorrowsCard);
  const deathRevealCard = useGameStore((state) => state.deathRevealCard);
  const hostSpellCard = useGameStore((state) => state.hostSpellCard);
  // Primitive selectors: tributeOfTheFourSorrowsSelection.x/y update on every mousemove while the
  // TributeOfTheFourSorrowsSelectionOverlay arrow is tracking the pointer; avoid re-rendering this HUD then.
  const tributeOfTheFourSorrowsSelectionActive = useGameStore((state) => Boolean(state.tributeOfTheFourSorrowsSelection));
  const tributeOfTheFourSorrowsSelectionKind = useGameStore((state) => state.tributeOfTheFourSorrowsSelection?.kind);
  const tributeOfTheFourSorrowsSelectionTargetId = useGameStore((state) => state.tributeOfTheFourSorrowsSelection?.targetId);
  const deselectTributeOfTheFourSorrowsSelectionTarget = useGameStore((state) => state.deselectTributeOfTheFourSorrowsSelectionTarget);
  const confirmTributeOfTheFourSorrowsSelection = useGameStore((state) => state.confirmTributeOfTheFourSorrowsSelection);
  const activatingEffectCardId = useGameStore((state) => state.activatingEffectCardId);
  const playerAttackAnimation = useGameStore((state) => state.playerAttackAnimation);
  const lifestealAttackAnimations = useGameStore((state) => state.lifestealAttackAnimations);
  const poisonAttackAnimation = useGameStore((state) => state.poisonAttackAnimation);
  const completePoisonAttackAnimation = useGameStore((state) => state.completePoisonAttackAnimation);
  const poisonConsumeAnimation = useGameStore((state) => state.poisonConsumeAnimation);
  const completePoisonConsumeAnimation = useGameStore((state) => state.completePoisonConsumeAnimation);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [hostTakingDamage, setHostTakingDamage] = useState(false);
  const lastPlayerAttackEvent = useRef<string | undefined>(undefined);
  const tributeOfTheFourSorrowsTarget = tributeOfTheFourSorrowsSelectionTargetId ? [...game.player.hand, ...game.player.field].find((card) => card.instanceId === tributeOfTheFourSorrowsSelectionTargetId) : undefined;
  const normalMillQueueLength = hostMillQueue.filter((item) => !item.preview).length;
  const hostLibraryIds = new Set(game.host.archive.map((card) => card.instanceId));
  const previewMillPendingInLibrary = hostMillPreviewCards.filter((card) => hostLibraryIds.has(card.instanceId)).length;
  const pendingMilledAfterActive = Math.max(0, normalMillQueueLength - 1);
  const visualHostLibraryCount = game.host.archive.length + pendingMilledAfterActive - previewMillPendingInLibrary;
  const visualHostGraveyardCount = Math.max(0, game.host.memory.length - pendingMilledAfterActive + previewMillPendingInLibrary);
  const pendingDamage = game.combat.playerAttackers.reduce((total, id) => {
    const attacker = game.player.field.find((card) => card.instanceId === id);
    return attacker ? total + getPowerEndurance(game, attacker).power : total;
  }, 0);
  const archiveDiscardThreshold = game.hostRules.damagePerArchiveDiscard;
  const poisonDiscardThreshold = game.hostRules.poisonPerArchiveDiscard;
  const pendingArchiveDiscards = Math.floor(pendingDamage / archiveDiscardThreshold);
  const remainingArchiveDiscards = remainingArchiveDiscardPreview(
    pendingArchiveDiscards,
    previewMillPendingInLibrary,
  );
  const attackCountVisible = game.phase === "combat" && game.activeSide === "player" && game.setupTurnsRemaining === 0 && game.combat.playerAttackers.length > 0;
  const latestLifestealAttack = lifestealAttackAnimations[lifestealAttackAnimations.length - 1];

  useEffect(() => {
    if (!playerAttackAnimation) {
      lastPlayerAttackEvent.current = undefined;
      return;
    }
    const eventKey = `${playerAttackAnimation.attackerId}:${playerAttackAnimation.eventId}`;
    if (lastPlayerAttackEvent.current === eventKey) return;
    lastPlayerAttackEvent.current = eventKey;
    setHostTakingDamage(false);
    const impactDelay = playerAttackHostHitDelay(playerAttackAnimation.customAnimation);
    let frame: number | undefined;
    let impactTimeout: number | undefined;
    let clearTimeout: number | undefined;
    const startImpact = () => {
      setHostTakingDamage(true);
      clearTimeout = window.setTimeout(() => setHostTakingDamage(false), 430);
    };
    if (impactDelay > 0) {
      impactTimeout = window.setTimeout(startImpact, impactDelay);
    } else {
      frame = window.requestAnimationFrame(startImpact);
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (impactTimeout !== undefined) window.clearTimeout(impactTimeout);
      if (clearTimeout !== undefined) window.clearTimeout(clearTimeout);
    };
  }, [playerAttackAnimation]);

  return (
    <div className={["fixed right-4 top-[4.5rem] space-y-2 text-[#f6e6b8]", graveyardOpen ? "z-[220]" : tributeOfTheFourSorrowsCard || deathRevealCard || hostSpellCard ? "z-[117]" : "z-50"].join(" ")}>
      <div className="flex items-start justify-end gap-2">
        <AnimatePresence>
        {deathRevealCard && (
          <motion.div
            key={`death-reveal-${deathRevealCard.instanceId}`}
            className="host-death-reveal-host flex flex-col items-center gap-2"
            // The entrance is CSS, not framer-motion. This card mounts in the same frame the
            // store commits a combat impact and the whole battlefield re-renders, and a
            // main-thread JS animation loses that race every time. A CSS keyframe on
            // transform/opacity is handed to the compositor and is immune to it. Only the exit
            // stays here, because AnimatePresence has to own unmount. Tribute of the Four Sorrows dodges this by
            // mounting with initial={false} and having no entrance at all.
            initial={false}
            // Exits into the Host graveyard button, which sits up and to the right of this host.
            exit={{
              opacity: [1, 1, 0],
              x: [0, -6, 168],
              y: [0, 8, -34],
              scale: [1, 0.97, 0.34],
              rotate: [0, -4, -12],
              transition: { duration: 0.38, times: [0, 0.2, 1], ease: ["easeOut", "easeIn"] },
            }}
          >
            {/* Dedicated layer for the entrance keyframe: the host owns the exit transform and
                the card below owns the activation pulse, so nothing shares an animation slot. */}
            <div className="host-death-reveal-enter">
              <div
                data-card-id={deathRevealCard.instanceId}
                className={[
                  "host-special-card host-special-card-dying",
                  activatingEffectCardId === deathRevealCard.instanceId ? "effect-card-activating" : "",
                ].join(" ")}
              >
                <Card
                  game={game}
                  card={deathRevealCard}
                  selectionDisabled
                  suppressContextMenu
                  suppressCardId
                  suppressStabilizing
                  showFullImage={shouldShowFullCardImage(deathRevealCard.definitionId)}
                  preferNativeImageRendering={shouldShowFullCardImage(deathRevealCard.definitionId)}
                />
              </div>
            </div>
          </motion.div>
        )}
        {hostSpellCard && (
          <motion.div
            key={`spell-reveal-${hostSpellCard.instanceId}`}
            className="host-special-card-host flex flex-col items-center gap-2"
            initial={false}
            exit={{
              opacity: [1, 1, 0],
              x: [0, 8, -50],
              y: [0, 10, -36],
              scale: [1, 0.97, 0.66],
              rotate: [0, 3, 9],
              transition: { duration: 0.3, times: [0, 0.22, 1], ease: ["easeOut", "easeIn"] },
            }}
          >
            <div className="host-death-reveal-enter">
              <div
                data-card-id={hostSpellCard.instanceId}
                className={[
                  "host-special-card host-special-card-resolving",
                  activatingEffectCardId === hostSpellCard.instanceId ? "effect-card-activating" : "",
                ].join(" ")}
              >
                <Card
                  game={game}
                  card={hostSpellCard}
                  selectionDisabled
                  suppressContextMenu
                  suppressCardId
                  suppressStabilizing
                  showFullImage={shouldShowFullCardImage(hostSpellCard.definitionId)}
                  preferNativeImageRendering={shouldShowFullCardImage(hostSpellCard.definitionId)}
                />
              </div>
            </div>
          </motion.div>
        )}
        {tributeOfTheFourSorrowsCard && (
          <motion.div
            key={tributeOfTheFourSorrowsCard.instanceId}
            className="host-special-card-host flex flex-col items-center gap-2"
            initial={false}
            exit={{
              opacity: [1, 1, 0],
              x: [0, 8, -50],
              y: [0, 10, -36],
              scale: [1, 0.97, 0.66],
              rotate: [0, 3, 9],
              transition: { duration: 0.3, times: [0, 0.22, 1], ease: ["easeOut", "easeIn"] },
            }}
          >
            <div
              data-card-id={tributeOfTheFourSorrowsCard.instanceId}
              className={[
                "host-special-card",
                tributeOfTheFourSorrowsSelectionActive ? "host-special-card-targeting" : "",
                !tributeOfTheFourSorrowsSelectionActive ? "host-special-card-resolving" : "",
                activatingEffectCardId === tributeOfTheFourSorrowsCard.instanceId ? "effect-card-activating" : "",
              ].join(" ")}
            >
              <Card
                game={game}
                card={tributeOfTheFourSorrowsCard}
                selectionDisabled
                suppressContextMenu
                suppressCardId
                suppressStabilizing
                showFullImage={shouldShowFullCardImage(tributeOfTheFourSorrowsCard.definitionId)}
                preferNativeImageRendering={shouldShowFullCardImage(tributeOfTheFourSorrowsCard.definitionId)}
              />
            </div>
            {tributeOfTheFourSorrowsSelectionActive && (
              <div className="tribute-of-the-four-sorrows-selection-panel-inline old-panel-soft">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#d6b879]">{t(tributeOfTheFourSorrowsSelectionKind === "discard" ? "target.discardCard" : tributeOfTheFourSorrowsSelectionKind === "sacrifice-creature" ? "target.sacrificeCreature" : "target.discardEnergy")}</span>
                <span className="text-sm text-[#d6b879]">
                  {tributeOfTheFourSorrowsSelectionKind === "sacrifice-land" && tributeOfTheFourSorrowsSelectionTargetId
                    ? t("target.energySelected")
                    : tributeOfTheFourSorrowsTarget
                      ? localizedCardName(tributeOfTheFourSorrowsTarget, language)
                      : t("target.noSelection")}
                </span>
                <div className="counter-target-actions">
                  {tributeOfTheFourSorrowsSelectionTargetId && (
                    <button data-audio-click="valid" className="counter-target-button counter-target-cancel" onClick={deselectTributeOfTheFourSorrowsSelectionTarget} title={t("common.cancel")}>
                      {t("common.cancel")}
                    </button>
                  )}
                  <button
                    data-audio-click={tributeOfTheFourSorrowsSelectionTargetId ? "valid" : undefined}
                    className="counter-target-button counter-target-confirm"
                    disabled={!tributeOfTheFourSorrowsSelectionTargetId}
                    onClick={confirmTributeOfTheFourSorrowsSelection}
                    title={t("common.confirm")}
                  >
                    <Check size={22} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
        <div className="host-deck-counter-cluster">
          <div
            data-player-attack-target="host-deck"
            data-host-life-panel="true"
            className={[
              "old-panel combatant-vitals combatant-vitals-host host-deck-counter flex min-w-44 items-center gap-3 px-3 py-2",
              attackCountVisible ? "is-attack-locked" : "",
              hostTakingDamage ? "host-counter-hit" : "",
              latestLifestealAttack ? "is-lifesteal-bitten" : "",
            ].join(" ")}
          >
            {latestLifestealAttack && (
              <span key={latestLifestealAttack.id} className="host-lifesteal-blood-wave" aria-hidden="true" />
            )}
            {poisonAttackAnimation && (
              <span
                key={poisonAttackAnimation.id}
                className="host-poison-impact"
                aria-hidden="true"
                onAnimationEnd={(event) => {
                  if (event.animationName === "host-poison-impact-lifetime") {
                    completePoisonAttackAnimation(poisonAttackAnimation.id);
                  }
                }}
              >
                {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
              </span>
            )}
            {poisonConsumeAnimation && (
              <span
                key={poisonConsumeAnimation.id}
                className="host-poison-consume"
                aria-hidden="true"
                onAnimationEnd={(event) => {
                  if (event.animationName === "host-poison-consume-lifetime") {
                    completePoisonConsumeAnimation(poisonConsumeAnimation.id);
                  }
                }}
              >
                {Array.from(
                  { length: Math.min(9, poisonConsumeAnimation.amount) },
                  (_, index) => <i key={index} />,
                )}
              </span>
            )}
            <div data-host-mill-origin="true" data-host-life-emblem="true" className="host-deck-emblem flex h-10 w-10 items-center justify-center border-2">
              <Skull size={24} />
            </div>
            <div className="host-deck-counter-copy">
              <div className="old-title host-deck-counter-title text-xs font-bold uppercase tracking-wide">{t("game.hostDeck")}</div>
              <div className="host-deck-counter-values flex items-end gap-2 leading-none">
                <div className="host-deck-count text-3xl font-black">{visualHostLibraryCount}</div>
                <AnimatePresence initial={false} mode="popLayout">
                  {attackCountVisible && remainingArchiveDiscards !== undefined && (
                    <motion.span
                      key={remainingArchiveDiscards}
                      className="host-deck-pending-mill"
                      initial={{ opacity: 0, x: -8, scale: 0.8 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -6, scale: 0.86 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    >
                      - {remainingArchiveDiscards}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {game.host.poisonCounters > 0 && (
              <GameTooltip content={t("game.poisonCounters", { count: game.host.poisonCounters, threshold: poisonDiscardThreshold })} side="bottom" className="host-poison-tooltip">
                <div
                  key={poisonAttackAnimation?.id ?? poisonConsumeAnimation?.id ?? `poison-${game.host.poisonCounters}`}
                  className={[
                    "host-poison-status",
                    poisonAttackAnimation ? "is-poison-gaining" : "",
                    poisonConsumeAnimation ? "is-poison-consuming" : "",
                  ].join(" ")}
                  aria-label={t("game.hostPoisonCounters", { count: game.host.poisonCounters, threshold: poisonDiscardThreshold })}
                >
                  <Droplet size={15} fill="currentColor" strokeWidth={2.2} />
                  <span>{game.host.poisonCounters}</span>
                </div>
              </GameTooltip>
            )}
          </div>
          <GameTooltip content={t("game.viewGraveyard")} side="bottom" className="host-deck-graveyard-host">
            <button
              data-host-mill-target="true"
              data-audio-click="valid"
              className="host-deck-graveyard flex items-center justify-center border font-black transition"
              onClick={() => setGraveyardOpen(true)}
              aria-label={t("game.viewHostGraveyard", { count: visualHostGraveyardCount })}
            >
              <Archive size={15} strokeWidth={2.4} />
              <span className="host-deck-graveyard-count">{visualHostGraveyardCount}</span>
            </button>
          </GameTooltip>
          <AnimatePresence initial={false} mode="popLayout">
            {attackCountVisible && (
              <motion.div
                key={game.combat.playerAttackers.join("|")}
                className="host-attack-count-host"
                initial={{ opacity: 0, x: -24, scaleX: 0.62 }}
                animate={{ opacity: 1, x: 0, scaleX: 1 }}
                exit={{ opacity: 0, x: -24, scaleX: 0.62 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <GameTooltip content={t("game.attackMillTooltip", { damage: pendingDamage, count: pendingArchiveDiscards })} side="bottom">
                  <div className="host-attack-count" aria-label={t("game.attackMillAria", { damage: pendingDamage, count: pendingArchiveDiscards })}>
                    <Swords size={17} strokeWidth={2.3} />
                    <span className="host-attack-formula">{pendingDamage} / {archiveDiscardThreshold} = - {pendingArchiveDiscards}</span>
                  </div>
                </GameTooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {graveyardOpen && <GraveyardViewerModal game={game} title={t("game.hostGraveyard")} cards={game.host.memory} onClose={() => setGraveyardOpen(false)} />}
    </div>
  );
}

export function PlayerLifePanel({ game, playerName }: { game: GameState; playerName: string }) {
  const t = useTranslation();
  const hostAttackAnimation = useGameStore((state) => state.hostAttackAnimation);
  const lifeDamageAnimationId = useGameStore((state) => state.lifeDamageAnimationId);
  const lifeBuffAnimationId = useGameStore((state) => state.lifeBuffAnimationId);
  const lifePaymentAnimation = useGameStore((state) => state.lifePaymentAnimation);
  const bloodPactAnimation = useGameStore((state) => state.bloodPactAnimation);
  const finalBanquetAnimation = useGameStore((state) => state.finalBanquetAnimation);
  const energyRecycleDragActive = useGameStore((state) => state.energyRecycleDragActive);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [chroniclerName, setChroniclerName] = useState(playerName);
  const [visualLife, setVisualLife] = useState(game.player.life);
  const [takingDamage, setTakingDamage] = useState(false);
  const lastEventId = useRef<number | undefined>(undefined);
  const lastLifeDamageAnimationId = useRef<number | undefined>(undefined);
  const bloodPactLifeFrame = useRef<number | undefined>(undefined);
  const finalBanquetLifeId = useRef<string | undefined>(undefined);
  const activePhaseIndex = game.phase === "combat" ? 1 : game.phase === "end" ? 2 : 0;
  const phaseSteps = [t("phase.main"), t("phase.battle"), t("phase.end")];
  const pendingDrain = game.activeSide === "player" && game.phase === "combat"
    ? previewPlayerAttackDrain(game)
    : 0;

  useEffect(() => {
    setVisualLife(bloodPactAnimation?.lifeBefore ?? game.player.life);
    lastEventId.current = undefined;
  }, [bloodPactAnimation?.id, bloodPactAnimation?.lifeBefore, game.player.life]);

  useEffect(() => {
    if (finalBanquetAnimation && finalBanquetLifeId.current !== finalBanquetAnimation.id) {
      finalBanquetLifeId.current = finalBanquetAnimation.id;
      setVisualLife(Math.max(0, game.player.life - finalBanquetAnimation.amount));
      return;
    }
    if (!finalBanquetAnimation && finalBanquetLifeId.current) {
      finalBanquetLifeId.current = undefined;
      setVisualLife(game.player.life);
    }
  }, [finalBanquetAnimation, game.player.life]);

  useEffect(() => {
    if (bloodPactLifeFrame.current) {
      window.cancelAnimationFrame(bloodPactLifeFrame.current);
      bloodPactLifeFrame.current = undefined;
    }
    if (!bloodPactAnimation || bloodPactAnimation.phase !== "impact") return;
    const startedAt = performance.now();
    const duration = 300;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      setVisualLife(Math.round(bloodPactAnimation.lifeBefore + (bloodPactAnimation.lifeAfter - bloodPactAnimation.lifeBefore) * eased));
      if (progress < 1) bloodPactLifeFrame.current = window.requestAnimationFrame(tick);
      else bloodPactLifeFrame.current = undefined;
    };
    bloodPactLifeFrame.current = window.requestAnimationFrame(tick);
    return () => {
      if (bloodPactLifeFrame.current) window.cancelAnimationFrame(bloodPactLifeFrame.current);
      bloodPactLifeFrame.current = undefined;
    };
  }, [bloodPactAnimation?.id, bloodPactAnimation?.lifeAfter, bloodPactAnimation?.lifeBefore, bloodPactAnimation?.phase]);

  useEffect(() => {
    if (!hostAttackAnimation || hostAttackAnimation.eventId === lastEventId.current || hostAttackAnimation.playerDamage <= 0) return;
    lastEventId.current = hostAttackAnimation.eventId;
    const hitDelay = hostAttackPlayerHitDelay(hostAttackAnimation.customAnimation);
    let frame: number | undefined;
    const impact = () => {
      if (hitDelay === 0) {
        setVisualLife((life) => Math.max(0, life - hostAttackAnimation.playerDamage));
      }
      setTakingDamage(false);
      frame = window.requestAnimationFrame(() => setTakingDamage(true));
    };
    const impactTimeout = window.setTimeout(impact, hitDelay);
    const clearTimeout = window.setTimeout(() => setTakingDamage(false), hitDelay + 430);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.clearTimeout(impactTimeout);
      window.clearTimeout(clearTimeout);
    };
  }, [hostAttackAnimation]);

  useEffect(() => {
    if (!lifeDamageAnimationId || lifeDamageAnimationId === lastLifeDamageAnimationId.current) return;
    lastLifeDamageAnimationId.current = lifeDamageAnimationId;
    setTakingDamage(false);
    const frame = window.requestAnimationFrame(() => setTakingDamage(true));
    const timeout = window.setTimeout(() => setTakingDamage(false), 430);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [lifeDamageAnimationId]);

  return (
    <>
      <div
        className={[
          "player-life-dock fixed bottom-4 right-4 flex items-end justify-end overflow-visible",
          finalBanquetAnimation
            ? "pointer-events-none z-[205]"
            : bloodPactAnimation
              ? "pointer-events-none z-[195]"
              : "z-[75]",
        ].join(" ")}
      >
        <div className="player-life-cluster">
          <div className={["game-phase-progress", game.gameMode === "chaos" ? "is-chaos" : ""].join(" ")} aria-label={t("game.currentPhase", { phase: phaseSteps[activePhaseIndex] })}>
            <div className="game-phase-progress-labels" aria-hidden="true">
              {phaseSteps.map((phase, index) => (
                <span key={phase} className={index === activePhaseIndex ? "is-active" : ""}>{phase}</span>
              ))}
            </div>
            <div className="game-phase-progress-track" aria-hidden="true">
              <span className="game-phase-progress-line" />
              {phaseSteps.map((phase, index) => (
                <span
                  key={phase}
                  className={[
                    "game-phase-progress-step",
                    index === activePhaseIndex ? "is-active" : "",
                    index < activePhaseIndex ? "is-complete" : "",
                  ].join(" ")}
                >
                  <span className="game-phase-progress-diamond" />
                </span>
              ))}
            </div>
          </div>
          <motion.div
            data-player-life-panel="true"
            data-energy-recycle-target="true"
            className="energy-recycle-life-target"
            initial={false}
            animate={{ scale: energyRecycleDragActive ? 1.045 : 1 }}
            transition={{ type: "spring", stiffness: 430, damping: 27, mass: 0.55 }}
            style={{ transformOrigin: "bottom right" }}
          >
          <div
            className={[
              "old-panel combatant-vitals combatant-vitals-player player-life-counter flex min-w-44 items-center gap-3 overflow-visible px-3 py-2 text-[#f6e6b8]",
              takingDamage ? "player-life-damage" : "",
              lifeBuffAnimationId ? "player-life-buff" : "",
              bloodPactAnimation?.phase === "impact" || lifePaymentAnimation || finalBanquetAnimation?.phase === "siphon" ? "blood-pact-life-corrupted" : "",
              lifePaymentAnimation || finalBanquetAnimation?.phase === "siphon" ? "life-payment-life-corrupted" : "",
            ].join(" ")}
          >
            {(bloodPactAnimation || lifePaymentAnimation || finalBanquetAnimation?.phase === "siphon") && <span className="blood-pact-life-wave" aria-hidden="true" />}
            {(bloodPactAnimation?.phase === "impact" || lifePaymentAnimation || finalBanquetAnimation?.phase === "siphon") && (
              <strong
                key={bloodPactAnimation?.phase === "impact" ? bloodPactAnimation.id : lifePaymentAnimation?.id ?? finalBanquetAnimation?.id}
                className="blood-pact-life-damage-number"
                aria-hidden="true"
              >
                -{bloodPactAnimation?.phase === "impact" ? bloodPactAnimation.amount : lifePaymentAnimation?.amount ?? finalBanquetAnimation?.amount}
              </strong>
            )}
            {lifeBuffAnimationId && <span key={lifeBuffAnimationId} className="buff-rise-lines life-buff-lines buff-rise-lines-green" aria-hidden="true" />}
            <div className="player-life-copy">
              <input
                className="old-title player-life-name-input text-xs font-bold uppercase tracking-wide"
                value={chroniclerName}
                maxLength={24}
                aria-label={t("game.chroniclerName")}
                onChange={(event) => setChroniclerName(event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="player-life-values flex items-end gap-2 leading-none">
                <div className="player-life-count">{visualLife}</div>
                <AnimatePresence initial={false} mode="popLayout">
                  {pendingDrain > 0 && (
                    <motion.strong
                      key={pendingDrain}
                      className="player-life-drain-preview"
                      aria-label={t("game.drainPreview", { amount: pendingDrain })}
                      initial={{ opacity: 0, y: 7, scale: 0.82 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.86 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    >
                      +{pendingDrain}
                    </motion.strong>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div data-player-discard-origin="true" data-player-life-emblem="true" className="player-life-emblem flex h-10 w-10 items-center justify-center border-2">
              <Heart size={24} />
            </div>
          </div>
          </motion.div>
          <GameTooltip content={t("game.viewGraveyard")} side="top" className="player-graveyard-host">
            <button
              data-player-discard-target="true"
              data-audio-click="valid"
              className="host-deck-graveyard player-graveyard-button flex items-center justify-center border font-black transition"
              onClick={() => setGraveyardOpen(true)}
              aria-label={t("game.viewPlayerGraveyard", { count: game.player.memory.length })}
            >
              <Archive size={15} strokeWidth={2.4} />
              <span className="host-deck-graveyard-count">{game.player.memory.length}</span>
            </button>
          </GameTooltip>
        </div>
      </div>
      {graveyardOpen && <GraveyardViewerModal game={game} title={t("game.playerGraveyard")} cards={game.player.memory} onClose={() => setGraveyardOpen(false)} />}
    </>
  );
}
