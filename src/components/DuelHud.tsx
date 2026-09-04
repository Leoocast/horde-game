import { Archive, Check, Droplet, Heart, Skull } from "lucide-react";
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
import {
  completedHostMillPreviewCount,
  hostArchiveAttackPreview,
  hostArchiveDiscardCounterValue,
} from "./hostArchiveCounter";
import { playerAttackHostHitDelay } from "./playerAttackPresentation";
import { PlayerArchiveForecast } from "./PlayerArchiveForecast";
import { setupProgress } from "./setupPresentation";
import { guidedAnchorRegistry, guidedPresentationActivity, guidedSurfaceAnchorKey } from "../guidance";

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
  const activeHostMillPreview = hostMillQueue[0]?.preview === true;
  const completedPreviewMills = completedHostMillPreviewCount(previewMillPendingInLibrary, activeHostMillPreview);
  const pendingMilledAfterActive = Math.max(0, normalMillQueueLength - 1);
  const visualHostLibraryCount = game.host.archive.length + pendingMilledAfterActive - previewMillPendingInLibrary;
  const visualHostGraveyardCount = Math.max(0, game.host.memory.length - pendingMilledAfterActive + completedPreviewMills);
  const pendingDamage = game.combat.playerAttackers.reduce((total, id) => {
    const attacker = game.player.field.find((card) => card.instanceId === id);
    return attacker ? total + getPowerEndurance(game, attacker).power : total;
  }, 0);
  const archiveDiscardThreshold = game.hostRules.damagePerArchiveDiscard;
  const poisonDiscardThreshold = game.hostRules.poisonPerArchiveDiscard;
  const attackCountVisible = game.phase === "combat" && game.activeSide === "player" && game.setupTurnsRemaining === 0 && game.combat.playerAttackers.length > 0;
  const attackSelectionVisible = attackCountVisible && !playerAttackAnimation && hostMillPreviewCards.length === 0;
  const attackArchiveStartCount = visualHostLibraryCount + previewMillPendingInLibrary;
  const archiveAttackPreview = hostArchiveAttackPreview(
    attackArchiveStartCount,
    pendingDamage,
    archiveDiscardThreshold,
  );
  const attackCounterValue = attackCountVisible
    ? hostArchiveDiscardCounterValue(
        archiveAttackPreview.discardCount,
        previewMillPendingInLibrary,
        Boolean(playerAttackAnimation) || hostMillPreviewCards.length > 0,
        activeHostMillPreview,
      )
    : undefined;
  const attackCounterVisible = attackCounterValue !== undefined;
  const attackCalculation = archiveAttackPreview.conversionCount === archiveAttackPreview.discardCount
    ? `${pendingDamage} ÷ ${archiveDiscardThreshold} → ${archiveAttackPreview.discardCount}`
    : `${pendingDamage} ÷ ${archiveDiscardThreshold} → ${archiveAttackPreview.conversionCount} · ${attackArchiveStartCount} → ${archiveAttackPreview.discardCount}`;
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
    <div className={["game-hud-host fixed right-4 top-[4.5rem] space-y-2 text-[#f6e6b8]", graveyardOpen ? "z-[220]" : tributeOfTheFourSorrowsCard || deathRevealCard || hostSpellCard ? "z-[117]" : "z-50"].join(" ")}>
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
              <div className="tribute-of-the-four-sorrows-selection-panel-inline hf-ui-panel-soft">
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
                    <button
                      ref={(element) => guidedAnchorRegistry.set(
                        guidedSurfaceAnchorKey("selection.cancelAction"),
                        "tribute-selection:cancel",
                        element,
                      )}
                      data-audio-click="valid"
                      className="counter-target-button counter-target-cancel"
                      onClick={deselectTributeOfTheFourSorrowsSelectionTarget}
                      title={t("common.cancel")}
                    >
                      {t("common.cancel")}
                    </button>
                  )}
                  <button
                    ref={(element) => guidedAnchorRegistry.set(
                      guidedSurfaceAnchorKey("selection.primaryAction"),
                      "tribute-selection:confirm",
                      element,
                    )}
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
        <div className={["host-deck-counter-cluster", attackCounterVisible ? "is-attack-counter-open" : ""].join(" ")}>
          <div
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("host.archive"),
              "duel-hud:host-archive",
              element,
            )}
            data-player-attack-target="host-deck"
            data-host-life-panel="true"
            className={[
              "hf-ui-panel combatant-vitals combatant-vitals-host host-deck-counter flex min-w-44 items-center gap-3 px-3 py-2",
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
            <div data-host-mill-origin="archive" data-host-life-emblem="true" className="host-deck-emblem flex h-10 w-10 items-center justify-center border-2">
              <Skull size={24} />
            </div>
            <div className="host-deck-counter-copy">
              <div className="hf-ui-title host-deck-counter-title text-xs font-bold uppercase tracking-wide">{t("game.hostArchive")}</div>
              <div className="host-deck-counter-values flex items-end gap-2 leading-none">
                <div className="host-deck-count text-3xl font-black">{visualHostLibraryCount}</div>
                <AnimatePresence initial={false} mode="popLayout">
                  {attackSelectionVisible && (
                    <motion.span
                      key={archiveAttackPreview.projectedArchiveCount}
                      className="host-deck-projection"
                      initial={{ opacity: 0, x: -8, scale: 0.8 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -6, scale: 0.86 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <span className="host-deck-projection-arrow" aria-hidden="true">→</span>
                      <span className="host-deck-projected-count">{archiveAttackPreview.projectedArchiveCount}</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {game.host.poisonCounters > 0 && (
              <GameTooltip content={t("game.poisonCounters", { count: game.host.poisonCounters, threshold: poisonDiscardThreshold })} side="bottom" className="host-poison-tooltip">
                <div
                  ref={(element) => guidedAnchorRegistry.set(
                    guidedSurfaceAnchorKey("host.poison"),
                    "duel-hud:host-poison",
                    element,
                  )}
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
          {/* Misma caja de Memoria que el Cronista, en fila con el panel de la Hueste. */}
          <GameTooltip content={t("game.viewGraveyard")} side="bottom" className="card-pile-host host-memory-pile-host">
            <button
              ref={(element) => guidedAnchorRegistry.set(
                guidedSurfaceAnchorKey("host.memory"),
                "duel-hud:host-memory",
                element,
              )}
              data-host-mill-target="true"
              data-audio-click="valid"
              className="card-pile card-pile-memory"
              onClick={() => setGraveyardOpen(true)}
              aria-label={t("game.viewHostGraveyard", { count: visualHostGraveyardCount })}
            >
              <span className="card-pile-glyph" aria-hidden="true">
                <Archive size={15} strokeWidth={2.2} />
              </span>
              <span key={`host-memory-${visualHostGraveyardCount}`} className="card-pile-count">{visualHostGraveyardCount}</span>
              <span className="card-pile-label">{t("zones.memory")}</span>
            </button>
          </GameTooltip>
          <AnimatePresence initial={false} mode="popLayout">
            {attackCounterVisible && (
              <motion.div
                key="host-archive-discard-counter"
                className="host-attack-count-host"
                initial={{ opacity: 0, x: 86, scaleX: 0.28 }}
                animate={{ opacity: 1, x: 0, scaleX: 1 }}
                exit={{ opacity: 0, x: 86, scaleX: 0.28 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              >
                <GameTooltip
                  content={(
                    <span className="host-attack-calculation-tooltip">
                      <strong>{t("game.attackCalculation")}</strong>
                      <span>{attackCalculation}</span>
                    </span>
                  )}
                  side="bottom"
                >
                  <div
                    className="host-attack-count"
                    tabIndex={0}
                    aria-label={t("game.attackMillAria", { damage: pendingDamage, count: archiveAttackPreview.discardCount })}
                  >
                    <span className="host-attack-card-loss" aria-hidden="true">
                      {Array.from({ length: archiveAttackPreview.visibleCardCount }, (_, index) => (
                        <i key={index} />
                      ))}
                      {archiveAttackPreview.discardCount === 0 && <i className="is-empty" />}
                    </span>
                    <span data-host-attack-mill-origin="true" className="host-attack-result-copy">
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.strong
                          key={attackCounterValue}
                          initial={{ opacity: 0, y: -7, scale: 0.82 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 7, scale: 0.82 }}
                          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {attackCounterValue}
                        </motion.strong>
                      </AnimatePresence>
                    </span>
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

export function PlayerLifePanel({ game, playerName, setupTurns }: { game: GameState; playerName: string; setupTurns: number }) {
  const t = useTranslation();
  const hostAttackAnimation = useGameStore((state) => state.hostAttackAnimation);
  const lifeDamageAnimationId = useGameStore((state) => state.lifeDamageAnimationId);
  const lifeBuffAnimationId = useGameStore((state) => state.lifeBuffAnimationId);
  const lifePaymentAnimation = useGameStore((state) => state.lifePaymentAnimation);
  const bloodPactAnimation = useGameStore((state) => state.bloodPactAnimation);
  const finalBanquetAnimation = useGameStore((state) => state.finalBanquetAnimation);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [chroniclerName, setChroniclerName] = useState(playerName);
  const [visualLife, setVisualLife] = useState(game.player.life);
  const [takingDamage, setTakingDamage] = useState(false);
  const lastEventId = useRef<number | undefined>(undefined);
  const lastLifeDamageAnimationId = useRef<number | undefined>(undefined);
  const bloodPactLifeFrame = useRef<number | undefined>(undefined);
  const finalBanquetLifeId = useRef<string | undefined>(undefined);
  const setup = game.activeSide === "player" ? setupProgress(setupTurns, game.setupTurnsRemaining) : undefined;
  const activePhaseIndex = setup ? setup.current - 1 : game.phase === "combat" ? 1 : game.phase === "end" ? 2 : 0;
  const phaseSteps = setup
    ? Array.from({ length: setup.total }, (_, index) => t("phase.setupStepShort", { current: index + 1 }))
    : [t("phase.main"), t("phase.battle"), t("phase.end")];
  const phaseProgressLabel = setup
    ? `${t("phase.setup")}. ${t("phase.setupStep", { current: setup.current, total: setup.total })}`
    : t("game.currentPhase", { phase: phaseSteps[activePhaseIndex] });
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
    let impactStarted = false;
    let damageActivity: ReturnType<typeof guidedPresentationActivity.begin> | undefined;
    const impact = () => {
      impactStarted = true;
      damageActivity = guidedPresentationActivity.begin(
        "life.damage",
        `host-attack:${hostAttackAnimation.eventId}`,
      );
      if (hitDelay === 0) {
        setVisualLife((life) => Math.max(0, life - hostAttackAnimation.playerDamage));
      }
      setTakingDamage(false);
      frame = window.requestAnimationFrame(() => setTakingDamage(true));
    };
    const impactTimeout = window.setTimeout(impact, hitDelay);
    const clearTimeout = window.setTimeout(() => {
      setTakingDamage(false);
      damageActivity?.end();
    }, hitDelay + 430);
    return () => {
      // El store puede retirar `hostAttackAnimation` apenas vuelve el atacante. Si el impacto ya
      // empezó, su reacción de Vida conserva su propio reloj y token hasta el último frame.
      if (impactStarted) return;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.clearTimeout(impactTimeout);
      window.clearTimeout(clearTimeout);
      damageActivity?.end();
      setTakingDamage(false);
    };
  }, [hostAttackAnimation]);

  useEffect(() => {
    if (!lifeDamageAnimationId || lifeDamageAnimationId === lastLifeDamageAnimationId.current) return;
    lastLifeDamageAnimationId.current = lifeDamageAnimationId;
    const damageActivity = guidedPresentationActivity.begin(
      "life.damage",
      `effect:${lifeDamageAnimationId}`,
    );
    setTakingDamage(false);
    const frame = window.requestAnimationFrame(() => setTakingDamage(true));
    const timeout = window.setTimeout(() => {
      setTakingDamage(false);
      damageActivity.end();
    }, 430);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      damageActivity.end();
      setTakingDamage(false);
    };
  }, [lifeDamageAnimationId]);

  return (
    <>
      <div
        className={[
          "player-life-dock game-hud-player fixed bottom-4 right-4 flex items-end justify-end overflow-visible",
          finalBanquetAnimation
            ? "pointer-events-none z-[205]"
            : bloodPactAnimation
              ? "pointer-events-none z-[195]"
              : "z-[75]",
        ].join(" ")}
      >
        <div className="player-life-cluster">
          <div className={["game-phase-progress", setup ? "is-setup" : "", game.gameMode === "chaos" ? "is-chaos" : ""].join(" ")} aria-label={phaseProgressLabel}>
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
          {/* One row, three boxes of the same height: Memory and Archive are card piles, Life is the
              only vitals panel and owns the screen corner. */}
          <div className="player-vitals-row">
            <GameTooltip content={t("game.viewGraveyard")} side="top" className="card-pile-host">
              <button
                ref={(element) => guidedAnchorRegistry.set(
                  guidedSurfaceAnchorKey("player.memory"),
                  "duel-hud:player-memory",
                  element,
                )}
                data-player-discard-target="true"
                data-audio-click="valid"
                className="card-pile card-pile-memory"
                onClick={() => setGraveyardOpen(true)}
                aria-label={t("game.viewPlayerGraveyard", { count: game.player.memory.length })}
              >
                <span className="card-pile-glyph" aria-hidden="true">
                  <Archive size={15} strokeWidth={2.2} />
                </span>
                <span key={`memory-${game.player.memory.length}`} className="card-pile-count">{game.player.memory.length}</span>
                <span className="card-pile-label">{t("zones.memory")}</span>
              </button>
            </GameTooltip>
            <PlayerArchiveForecast game={game} />
          <div
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("player.life"),
              "duel-hud:player-life",
              element,
            )}
            data-player-life-panel="true"
            className="energy-recycle-life-target"
          >
          <div
            className={[
              "hf-ui-panel combatant-vitals combatant-vitals-player player-life-counter flex items-center gap-3 overflow-visible px-3 py-2 text-[#f6e6b8]",
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
                className="hf-ui-title player-life-name-input text-xs font-bold uppercase tracking-wide"
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
          </div>
          </div>
        </div>
      </div>
      {graveyardOpen && <GraveyardViewerModal game={game} title={t("game.playerGraveyard")} cards={game.player.memory} onClose={() => setGraveyardOpen(false)} />}
    </>
  );
}
