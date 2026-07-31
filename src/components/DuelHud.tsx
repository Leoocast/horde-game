import { Archive, Check, Droplet, Heart, Skull, Swords } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { getPowerToughness } from "../engine/StaticEffects";
import { isTutorialOverlayActive } from "../engine/Tutorial";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";
import { GameTooltip } from "./GameTooltip";
import { GraveyardViewerModal } from "./GraveyardViewerModal";

export function DuelHud({ game }: { game: GameState }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const hordeMillQueue = useGameStore((state) => state.hordeMillAnimationQueue);
  const hordeMillPreviewCards = useGameStore((state) => state.hordeMillPreviewCards);
  const smallpoxCard = useGameStore((state) => state.smallpoxCard);
  const deathRevealCard = useGameStore((state) => state.deathRevealCard);
  const hordeSpellCard = useGameStore((state) => state.hordeSpellCard);
  // Primitive selectors: smallpoxSelection.x/y update on every mousemove while the
  // SmallpoxSelectionOverlay arrow is tracking the pointer; avoid re-rendering this HUD then.
  const smallpoxSelectionActive = useGameStore((state) => Boolean(state.smallpoxSelection));
  const smallpoxSelectionKind = useGameStore((state) => state.smallpoxSelection?.kind);
  const smallpoxSelectionTargetId = useGameStore((state) => state.smallpoxSelection?.targetId);
  const deselectSmallpoxSelectionTarget = useGameStore((state) => state.deselectSmallpoxSelectionTarget);
  const confirmSmallpoxSelection = useGameStore((state) => state.confirmSmallpoxSelection);
  const activatingEffectCardId = useGameStore((state) => state.activatingEffectCardId);
  const playerAttackAnimation = useGameStore((state) => state.playerAttackAnimation);
  const lifestealAttackAnimations = useGameStore((state) => state.lifestealAttackAnimations);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [hordeTakingDamage, setHordeTakingDamage] = useState(false);
  const lastPlayerAttackEvent = useRef<string | undefined>(undefined);
  const smallpoxTarget = smallpoxSelectionTargetId ? [...game.player.hand, ...game.player.battlefield].find((card) => card.instanceId === smallpoxSelectionTargetId) : undefined;
  const normalMillQueueLength = hordeMillQueue.filter((item) => !item.preview).length;
  const hordeLibraryIds = new Set(game.horde.library.map((card) => card.instanceId));
  const previewMillPendingInLibrary = hordeMillPreviewCards.filter((card) => hordeLibraryIds.has(card.instanceId)).length;
  const pendingMilledAfterActive = Math.max(0, normalMillQueueLength - 1);
  const visualHordeLibraryCount = game.horde.library.length + pendingMilledAfterActive - previewMillPendingInLibrary;
  const visualHordeGraveyardCount = Math.max(0, game.horde.graveyard.length - pendingMilledAfterActive + previewMillPendingInLibrary);
  const pendingDamage = game.combat.playerAttackers.reduce((total, id) => {
    const attacker = game.player.battlefield.find((card) => card.instanceId === id);
    return attacker ? total + getPowerToughness(game, attacker).power : total;
  }, 0);
  const pendingMill = Math.floor(pendingDamage / 3);
  const attackCountVisible = game.phase === "combat" && game.activeSide === "player" && game.setupTurnsRemaining === 0 && game.combat.playerAttackers.length > 0;
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const tutorialOverlayActive = isTutorialOverlayActive(game, tutorialAcknowledgedStepId);
  const latestLifestealAttack = lifestealAttackAnimations[lifestealAttackAnimations.length - 1];

  useEffect(() => {
    if (!playerAttackAnimation) {
      lastPlayerAttackEvent.current = undefined;
      return;
    }
    const eventKey = `${playerAttackAnimation.attackerId}:${playerAttackAnimation.eventId}`;
    if (lastPlayerAttackEvent.current === eventKey) return;
    lastPlayerAttackEvent.current = eventKey;
    setHordeTakingDamage(false);
    const frame = window.requestAnimationFrame(() => setHordeTakingDamage(true));
    const timeout = window.setTimeout(() => setHordeTakingDamage(false), 430);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [playerAttackAnimation]);

  return (
    <div className={["fixed right-4 top-[4.5rem] space-y-2 text-[#f6e6b8]", graveyardOpen ? "z-[220]" : smallpoxCard || deathRevealCard || hordeSpellCard ? "z-[117]" : tutorialOverlayActive ? "z-[91]" : "z-50"].join(" ")}>
      <div className="flex items-start justify-end gap-2">
        <AnimatePresence>
        {deathRevealCard && (
          <motion.div
            key={`death-reveal-${deathRevealCard.instanceId}`}
            className="horde-death-reveal-host flex flex-col items-center gap-2"
            // The entrance is CSS, not framer-motion. This card mounts in the same frame the
            // store commits a combat impact and the whole battlefield re-renders, and a
            // main-thread JS animation loses that race every time. A CSS keyframe on
            // transform/opacity is handed to the compositor and is immune to it. Only the exit
            // stays here, because AnimatePresence has to own unmount. Smallpox dodges this by
            // mounting with initial={false} and having no entrance at all.
            initial={false}
            // Exits into the Horde graveyard button, which sits up and to the right of this host.
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
            <div className="horde-death-reveal-enter">
              <div
                data-card-id={deathRevealCard.instanceId}
                className={[
                  "horde-special-card horde-special-card-dying",
                  activatingEffectCardId === deathRevealCard.instanceId ? "effect-card-activating" : "",
                ].join(" ")}
              >
                <Card
                  game={game}
                  card={deathRevealCard}
                  selectionDisabled
                  suppressContextMenu
                  suppressCardId
                  suppressSummoningSickness
                  showFullImage={shouldShowFullCardImage(deathRevealCard.definitionId)}
                  preferNativeImageRendering={shouldShowFullCardImage(deathRevealCard.definitionId)}
                />
              </div>
            </div>
          </motion.div>
        )}
        {hordeSpellCard && (
          <motion.div
            key={`spell-reveal-${hordeSpellCard.instanceId}`}
            className="horde-special-card-host flex flex-col items-center gap-2"
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
            <div className="horde-death-reveal-enter">
              <div
                data-card-id={hordeSpellCard.instanceId}
                className={[
                  "horde-special-card horde-special-card-resolving",
                  activatingEffectCardId === hordeSpellCard.instanceId ? "effect-card-activating" : "",
                ].join(" ")}
              >
                <Card
                  game={game}
                  card={hordeSpellCard}
                  selectionDisabled
                  suppressContextMenu
                  suppressCardId
                  suppressSummoningSickness
                  showFullImage={shouldShowFullCardImage(hordeSpellCard.definitionId)}
                  preferNativeImageRendering={shouldShowFullCardImage(hordeSpellCard.definitionId)}
                />
              </div>
            </div>
          </motion.div>
        )}
        {smallpoxCard && (
          <motion.div
            key={smallpoxCard.instanceId}
            className="horde-special-card-host flex flex-col items-center gap-2"
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
              data-card-id={smallpoxCard.instanceId}
              className={[
                "horde-special-card",
                smallpoxSelectionActive ? "horde-special-card-targeting" : "",
                !smallpoxSelectionActive ? "horde-special-card-resolving" : "",
                activatingEffectCardId === smallpoxCard.instanceId ? "effect-card-activating" : "",
              ].join(" ")}
            >
              <Card
                game={game}
                card={smallpoxCard}
                selectionDisabled
                suppressContextMenu
                suppressCardId
                suppressSummoningSickness
                showFullImage={shouldShowFullCardImage(smallpoxCard.definitionId)}
                preferNativeImageRendering={shouldShowFullCardImage(smallpoxCard.definitionId)}
              />
            </div>
            {smallpoxSelectionActive && (
              <div className="smallpox-selection-panel-inline old-panel-soft">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#d6b879]">{t(smallpoxSelectionKind === "discard" ? "target.discardCard" : smallpoxSelectionKind === "sacrifice-creature" ? "target.sacrificeCreature" : "target.discardEnergy")}</span>
                <span className="text-sm text-[#d6b879]">
                  {smallpoxSelectionKind === "sacrifice-land" && smallpoxSelectionTargetId
                    ? t("target.energySelected")
                    : smallpoxTarget
                      ? localizedCardName(smallpoxTarget, language)
                      : t("target.noSelection")}
                </span>
                <div className="counter-target-actions">
                  {smallpoxSelectionTargetId && (
                    <button data-audio-click="valid" className="counter-target-button counter-target-cancel" onClick={deselectSmallpoxSelectionTarget} title={t("common.cancel")}>
                      {t("common.cancel")}
                    </button>
                  )}
                  <button
                    data-audio-click={smallpoxSelectionTargetId ? "valid" : undefined}
                    className="counter-target-button counter-target-confirm"
                    disabled={!smallpoxSelectionTargetId}
                    onClick={confirmSmallpoxSelection}
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
        <div className="horde-deck-counter-cluster">
          <div
            data-player-attack-target="horde-deck"
            data-horde-life-panel="true"
            className={[
              "old-panel combatant-vitals combatant-vitals-horde horde-deck-counter flex min-w-44 items-center gap-3 px-3 py-2",
              attackCountVisible ? "is-attack-locked" : "",
              hordeTakingDamage ? "horde-counter-hit" : "",
              latestLifestealAttack ? "is-lifesteal-bitten" : "",
            ].join(" ")}
          >
            {latestLifestealAttack && (
              <span key={latestLifestealAttack.id} className="horde-lifesteal-blood-wave" aria-hidden="true" />
            )}
            <div data-horde-mill-origin="true" data-horde-life-emblem="true" className="horde-deck-emblem flex h-10 w-10 items-center justify-center border-2">
              <Skull size={24} />
            </div>
            <div className="horde-deck-counter-copy">
              <div className="old-title horde-deck-counter-title text-xs font-bold uppercase tracking-wide">{t("game.hordeDeck")}</div>
              <div className="horde-deck-counter-values flex items-end gap-2 leading-none">
                <div className="horde-deck-count text-3xl font-black">{visualHordeLibraryCount}</div>
                <AnimatePresence initial={false} mode="popLayout">
                  {attackCountVisible && (
                    <motion.span
                      key={pendingMill}
                      className="horde-deck-pending-mill"
                      initial={{ opacity: 0, x: -8, scale: 0.8 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -6, scale: 0.86 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    >
                      - {pendingMill}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {game.horde.poisonCounters > 0 && (
              <GameTooltip content={t("game.poisonCounters", { count: game.horde.poisonCounters })} side="bottom" className="horde-poison-tooltip">
                <div className="horde-poison-status" aria-label={t("game.hordePoisonCounters", { count: game.horde.poisonCounters })}>
                  <Droplet size={15} fill="currentColor" strokeWidth={2.2} />
                  <span>{game.horde.poisonCounters}</span>
                </div>
              </GameTooltip>
            )}
          </div>
          <GameTooltip content={t("game.viewGraveyard")} side="bottom" className="horde-deck-graveyard-host">
            <button
              data-horde-mill-target="true"
              data-audio-click="valid"
              className="horde-deck-graveyard flex items-center justify-center border font-black transition"
              onClick={() => setGraveyardOpen(true)}
              aria-label={t("game.viewHordeGraveyard", { count: visualHordeGraveyardCount })}
            >
              <Archive size={15} strokeWidth={2.4} />
              <span className="horde-deck-graveyard-count">{visualHordeGraveyardCount}</span>
            </button>
          </GameTooltip>
          <AnimatePresence initial={false} mode="popLayout">
            {attackCountVisible && (
              <motion.div
                key={game.combat.playerAttackers.join("|")}
                className="horde-attack-count-host"
                initial={{ opacity: 0, x: -24, scaleX: 0.62 }}
                animate={{ opacity: 1, x: 0, scaleX: 1 }}
                exit={{ opacity: 0, x: -24, scaleX: 0.62 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <GameTooltip content={t("game.attackMillTooltip", { damage: pendingDamage, count: pendingMill })} side="bottom">
                  <div className="horde-attack-count" aria-label={t("game.attackMillAria", { damage: pendingDamage, count: pendingMill })}>
                    <Swords size={17} strokeWidth={2.3} />
                    <span className="horde-attack-formula">{pendingDamage} / 3 = - {pendingMill}</span>
                  </div>
                </GameTooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {graveyardOpen && <GraveyardViewerModal game={game} title={t("game.hordeGraveyard")} cards={game.horde.graveyard} onClose={() => setGraveyardOpen(false)} />}
    </div>
  );
}

export function PlayerLifePanel({ game, playerName }: { game: GameState; playerName: string }) {
  const t = useTranslation();
  const hordeAttackAnimation = useGameStore((state) => state.hordeAttackAnimation);
  const lifeDamageAnimationId = useGameStore((state) => state.lifeDamageAnimationId);
  const lifeBuffAnimationId = useGameStore((state) => state.lifeBuffAnimationId);
  const lifePaymentAnimation = useGameStore((state) => state.lifePaymentAnimation);
  const bloodPactAnimation = useGameStore((state) => state.bloodPactAnimation);
  const energyRecycleDragActive = useGameStore((state) => state.energyRecycleDragActive);
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const tutorialOverlayActive = isTutorialOverlayActive(game, tutorialAcknowledgedStepId);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [chroniclerName, setChroniclerName] = useState(playerName);
  const [visualLife, setVisualLife] = useState(game.player.life);
  const [takingDamage, setTakingDamage] = useState(false);
  const lastEventId = useRef<number | undefined>(undefined);
  const lastLifeDamageAnimationId = useRef<number | undefined>(undefined);
  const bloodPactLifeFrame = useRef<number | undefined>(undefined);
  const activePhaseIndex = game.phase === "combat" ? 1 : game.phase === "end" ? 2 : 0;
  const phaseSteps = [t("phase.main"), t("phase.battle"), t("phase.end")];

  useEffect(() => {
    setVisualLife(bloodPactAnimation?.lifeBefore ?? game.player.life);
    lastEventId.current = undefined;
  }, [bloodPactAnimation?.id, bloodPactAnimation?.lifeBefore, game.player.life]);

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
    if (!hordeAttackAnimation || hordeAttackAnimation.eventId === lastEventId.current || hordeAttackAnimation.playerDamage <= 0) return;
    lastEventId.current = hordeAttackAnimation.eventId;
    setVisualLife((life) => Math.max(0, life - hordeAttackAnimation.playerDamage));
    setTakingDamage(false);
    const frame = window.requestAnimationFrame(() => setTakingDamage(true));
    const timeout = window.setTimeout(() => setTakingDamage(false), 430);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [hordeAttackAnimation]);

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
          bloodPactAnimation
            ? "pointer-events-none z-[195]"
            : tutorialOverlayActive
              ? "z-[91]"
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
              bloodPactAnimation?.phase === "impact" || lifePaymentAnimation ? "blood-pact-life-corrupted" : "",
              lifePaymentAnimation ? "life-payment-life-corrupted" : "",
            ].join(" ")}
          >
            {(bloodPactAnimation || lifePaymentAnimation) && <span className="blood-pact-life-wave" aria-hidden="true" />}
            {(bloodPactAnimation?.phase === "impact" || lifePaymentAnimation) && (
              <strong
                key={bloodPactAnimation?.phase === "impact" ? bloodPactAnimation.id : lifePaymentAnimation?.id}
                className="blood-pact-life-damage-number"
                aria-hidden="true"
              >
                -{bloodPactAnimation?.phase === "impact" ? bloodPactAnimation.amount : lifePaymentAnimation?.amount}
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
              className="horde-deck-graveyard player-graveyard-button flex items-center justify-center border font-black transition"
              onClick={() => setGraveyardOpen(true)}
              aria-label={t("game.viewPlayerGraveyard", { count: game.player.graveyard.length })}
            >
              <Archive size={15} strokeWidth={2.4} />
              <span className="horde-deck-graveyard-count">{game.player.graveyard.length}</span>
            </button>
          </GameTooltip>
        </div>
      </div>
      {graveyardOpen && <GraveyardViewerModal game={game} title={t("game.playerGraveyard")} cards={game.player.graveyard} onClose={() => setGraveyardOpen(false)} />}
    </>
  );
}
