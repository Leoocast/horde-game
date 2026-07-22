import { motion } from "framer-motion";
import type { GameState } from "../engine/GameTypes";
import { HORDE_SURGE_TURN } from "../engine/StaticEffects";

export function TurnPhaseHud({ game }: { game: GameState }) {
  const hordeReady = game.activeSide === "horde" && game.phase === "horde" && game.combat.hordeAttackers.length === 0;
  const owner = game.activeSide === "horde" && game.phase !== "end" && !hordeReady ? "Horde Turn" : "Chronicler Turn";
  const setupActive = game.activeSide === "player" && game.setupTurnsRemaining > 0;
  const phase = setupActive ? "Setup" : hordeReady ? "End" : game.phase === "horde" ? "Main" : game.phase;
  const hordeTurn = game.activeSide === "horde" && !hordeReady;
  const turnsUntilSurge = Math.max(0, HORDE_SURGE_TURN - game.hordeTurnNumber);
  return (
    <div
      className={[
        "game-turn-hud flex h-10 items-center gap-3 px-4 text-center text-[#f6e6b8]",
        hordeTurn ? "is-horde-turn" : "",
      ].join(" ")}
    >
      <div className="game-turn-owner whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em]">{owner}</div>
      <div className="game-turn-divider h-4 w-px" />
      <div className="game-turn-phase whitespace-nowrap text-sm font-black capitalize leading-none">{phase}</div>
      <div className="game-turn-divider h-4 w-px" />
      <div className="game-turn-count game-surge-countdown flex min-w-[86px] items-center justify-center gap-1.5 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em]">
        {turnsUntilSurge > 0 ? (
          <>
            <span>Surge in</span>
            <motion.strong
              key={turnsUntilSurge}
              className="game-surge-countdown-number"
              initial={{ opacity: 0.18, scale: 4.8, y: 5, filter: "brightness(2.2)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "brightness(1)" }}
              transition={{ type: "spring", stiffness: 360, damping: 21, mass: 0.72 }}
            >
              {turnsUntilSurge}
            </motion.strong>
          </>
        ) : (
          <span className="game-surge-active-label">Surge active</span>
        )}
      </div>
    </div>
  );
}
