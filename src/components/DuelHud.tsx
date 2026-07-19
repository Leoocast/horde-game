import { Archive, Check, Droplet, Heart, Skull, Swords } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { getPowerToughness } from "../engine/StaticEffects";
import { isTutorialOverlayActive } from "../engine/Tutorial";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";
import { GameTooltip } from "./GameTooltip";
import { GraveyardViewerModal } from "./GraveyardViewerModal";

const SMALLPOX_KIND_LABEL: Record<string, string> = {
  discard: "Choose a card to discard",
  "sacrifice-creature": "Choose a creature to sacrifice",
  "sacrifice-land": "Choose one energy to discard",
};

export function DuelHud({ game }: { game: GameState }) {
  const hordeMillQueue = useGameStore((state) => state.hordeMillAnimationQueue);
  const hordeMillPreviewCards = useGameStore((state) => state.hordeMillPreviewCards);
  const smallpoxCard = useGameStore((state) => state.smallpoxCard);
  // Primitive selectors: smallpoxSelection.x/y update on every mousemove while the
  // SmallpoxSelectionOverlay arrow is tracking the pointer; avoid re-rendering this HUD then.
  const smallpoxSelectionActive = useGameStore((state) => Boolean(state.smallpoxSelection));
  const smallpoxSelectionKind = useGameStore((state) => state.smallpoxSelection?.kind);
  const smallpoxSelectionTargetId = useGameStore((state) => state.smallpoxSelection?.targetId);
  const deselectSmallpoxSelectionTarget = useGameStore((state) => state.deselectSmallpoxSelectionTarget);
  const confirmSmallpoxSelection = useGameStore((state) => state.confirmSmallpoxSelection);
  const activatingEffectCardId = useGameStore((state) => state.activatingEffectCardId);
  const playerAttackAnimation = useGameStore((state) => state.playerAttackAnimation);
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
    <div className={["fixed right-4 top-[4.5rem] space-y-2 text-[#f6e6b8]", graveyardOpen ? "z-[220]" : smallpoxCard ? "z-[117]" : tutorialOverlayActive ? "z-[91]" : "z-50"].join(" ")}>
      <div className="flex items-start justify-end gap-2">
        <AnimatePresence>
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
              <Card game={game} card={smallpoxCard} selectionDisabled suppressContextMenu suppressCardId suppressSummoningSickness />
            </div>
            {smallpoxSelectionActive && (
              <div className="smallpox-selection-panel-inline old-panel-soft">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#d6b879]">{SMALLPOX_KIND_LABEL[smallpoxSelectionKind!]}</span>
                <span className="text-sm text-[#d6b879]">
                  {smallpoxSelectionKind === "sacrifice-land" && smallpoxSelectionTargetId
                    ? "Energy selected"
                    : smallpoxTarget
                      ? smallpoxTarget.displayName
                      : "No target selected"}
                </span>
                <div className="counter-target-actions">
                  {smallpoxSelectionTargetId && (
                    <button data-audio-click="valid" className="counter-target-button counter-target-cancel" onClick={deselectSmallpoxSelectionTarget} title="Cancel">
                      Cancel
                    </button>
                  )}
                  <button
                    data-audio-click={smallpoxSelectionTargetId ? "valid" : undefined}
                    className="counter-target-button counter-target-confirm"
                    disabled={!smallpoxSelectionTargetId}
                    onClick={confirmSmallpoxSelection}
                    title="Confirm"
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
            className={[
              "old-panel combatant-vitals combatant-vitals-horde horde-deck-counter flex min-w-44 items-center gap-3 px-3 py-2",
              attackCountVisible ? "is-attack-locked" : "",
              hordeTakingDamage ? "horde-counter-hit" : "",
            ].join(" ")}
          >
            <div data-horde-mill-origin="true" className="horde-deck-emblem flex h-10 w-10 items-center justify-center border-2">
              <Skull size={24} />
            </div>
            <div className="horde-deck-counter-copy">
              <div className="old-title horde-deck-counter-title text-xs font-bold uppercase tracking-wide">Horde Deck</div>
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
              <GameTooltip content={`Poison counters: ${game.horde.poisonCounters} of 3`} side="bottom" className="horde-poison-tooltip">
                <div className="horde-poison-status" aria-label={`Horde poison counters: ${game.horde.poisonCounters} of 3`}>
                  <Droplet size={15} fill="currentColor" strokeWidth={2.2} />
                  <span>{game.horde.poisonCounters}</span>
                </div>
              </GameTooltip>
            )}
          </div>
          <GameTooltip content="View graveyard" side="bottom" className="horde-deck-graveyard-host">
            <button
              data-horde-mill-target="true"
              data-audio-click="valid"
              className="horde-deck-graveyard flex items-center justify-center border font-black transition"
              onClick={() => setGraveyardOpen(true)}
              aria-label={`View Horde graveyard, ${visualHordeGraveyardCount} cards`}
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
                <GameTooltip content={`${pendingDamage} attack damage ÷ 3 mills ${pendingMill} Horde cards`} side="bottom">
                  <div className="horde-attack-count" aria-label={`${pendingDamage} attack damage mills ${pendingMill} Horde cards`}>
                    <Swords size={17} strokeWidth={2.3} />
                    <span className="horde-attack-formula">{pendingDamage} / 3 = - {pendingMill}</span>
                  </div>
                </GameTooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {graveyardOpen && <GraveyardViewerModal game={game} title="Horde Graveyard" cards={game.horde.graveyard} onClose={() => setGraveyardOpen(false)} />}
    </div>
  );
}

export function PlayerLifePanel({ game, playerName }: { game: GameState; playerName: string }) {
  const hordeAttackAnimation = useGameStore((state) => state.hordeAttackAnimation);
  const lifeBuffAnimationId = useGameStore((state) => state.lifeBuffAnimationId);
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const tutorialOverlayActive = isTutorialOverlayActive(game, tutorialAcknowledgedStepId);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [chroniclerName, setChroniclerName] = useState(playerName);
  const [visualLife, setVisualLife] = useState(game.player.life);
  const [takingDamage, setTakingDamage] = useState(false);
  const lastEventId = useRef<number | undefined>(undefined);
  const activePhaseIndex = game.phase === "combat" ? 1 : game.phase === "end" ? 2 : 0;
  const phaseSteps = ["Main", "Battle", "End"];

  useEffect(() => {
    setVisualLife(game.player.life);
    lastEventId.current = undefined;
  }, [game.player.life]);

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

  return (
    <>
      <div
        className={[
          "player-life-dock fixed bottom-4 right-4 flex items-end justify-end overflow-visible",
          tutorialOverlayActive ? "z-[91]" : "z-[75]",
        ].join(" ")}
      >
        <div className="player-life-cluster">
          <div className="game-phase-progress" aria-label={`Current phase: ${phaseSteps[activePhaseIndex]}`}>
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
          <div
            data-player-life-panel="true"
            className={[
              "old-panel combatant-vitals combatant-vitals-player player-life-counter flex min-w-44 items-center gap-3 overflow-visible px-3 py-2 text-[#f6e6b8]",
              takingDamage ? "player-life-damage" : "",
              lifeBuffAnimationId ? "player-life-buff" : "",
            ].join(" ")}
          >
            {lifeBuffAnimationId && <span key={lifeBuffAnimationId} className="buff-rise-lines life-buff-lines buff-rise-lines-green" aria-hidden="true" />}
            <div className="player-life-copy">
              <input
                className="old-title player-life-name-input text-xs font-bold uppercase tracking-wide"
                value={chroniclerName}
                maxLength={24}
                aria-label="Chronicler name"
                onChange={(event) => setChroniclerName(event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="player-life-values flex items-end gap-2 leading-none">
                <div className="player-life-count">{visualLife}</div>
              </div>
            </div>
            <div data-player-discard-origin="true" className="player-life-emblem flex h-10 w-10 items-center justify-center border-2">
              <Heart size={24} />
            </div>
          </div>
          <GameTooltip content="View graveyard" side="top" className="player-graveyard-host">
            <button
              data-player-discard-target="true"
              data-audio-click="valid"
              className="horde-deck-graveyard player-graveyard-button flex items-center justify-center border font-black transition"
              onClick={() => setGraveyardOpen(true)}
              aria-label={`View Chronicler graveyard, ${game.player.graveyard.length} cards`}
            >
              <Archive size={15} strokeWidth={2.4} />
              <span className="horde-deck-graveyard-count">{game.player.graveyard.length}</span>
            </button>
          </GameTooltip>
        </div>
      </div>
      {graveyardOpen && <GraveyardViewerModal game={game} title="Chronicler Graveyard" cards={game.player.graveyard} onClose={() => setGraveyardOpen(false)} />}
    </>
  );
}
