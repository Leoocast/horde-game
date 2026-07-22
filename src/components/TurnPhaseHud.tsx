import { motion } from "framer-motion";
import type { GameState } from "../engine/GameTypes";
import { hordeSurgeTurn } from "../engine/StaticEffects";
import { useTranslation } from "../i18n/useTranslation";

export function TurnPhaseHud({ game }: { game: GameState }) {
  const t = useTranslation();
  const hordeReady = game.activeSide === "horde" && game.phase === "horde" && game.combat.hordeAttackers.length === 0;
  const owner = game.activeSide === "horde" && game.phase !== "end" && !hordeReady ? t("turn.horde") : t("turn.chronicler");
  const setupActive = game.activeSide === "player" && game.setupTurnsRemaining > 0;
  const phaseKey = setupActive ? "phase.setup" : hordeReady ? "phase.end" : game.phase === "horde" ? "phase.main" : (`phase.${game.phase}` as const);
  const phase = t(phaseKey);
  const hordeTurn = game.activeSide === "horde" && !hordeReady;
  const turnsUntilSurge = Math.max(0, hordeSurgeTurn(game) - game.hordeTurnNumber);
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
            <span>{t("turn.surgeIn")}</span>
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
          <span className="game-surge-active-label">{t("turn.surgeActive")}</span>
        )}
      </div>
    </div>
  );
}
