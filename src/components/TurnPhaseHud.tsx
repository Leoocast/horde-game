import { motion } from "framer-motion";
import type { GameState } from "../engine/GameTypes";
import { hostSurgeTurn } from "../engine/StaticEffects";
import { useTranslation } from "../i18n/useTranslation";
import { setupProgress } from "./setupPresentation";

export function TurnPhaseHud({ game, setupTurns }: { game: GameState; setupTurns: number }) {
  const t = useTranslation();
  const hostReady = game.activeSide === "host" && game.phase === "host" && game.combat.hostAttackers.length === 0;
  const owner = game.activeSide === "host" && game.phase !== "end" && !hostReady ? t("turn.host") : t("turn.chronicler");
  const setup = game.activeSide === "player" ? setupProgress(setupTurns, game.setupTurnsRemaining) : undefined;
  const phaseKey = hostReady ? "phase.end" : game.phase === "host" ? "phase.hostPhase" : (`phase.${game.phase}` as const);
  const phase = t(phaseKey);
  const hostTurn = game.activeSide === "host" && !hostReady;
  const turnsUntilSurge = Math.max(0, hostSurgeTurn(game) - game.hostTurnNumber);

  if (setup) {
    const stepLabel = t("phase.setupStep", { current: setup.current, total: setup.total });
    const compactLabel = t("phase.setupStepBanner", { current: setup.current, total: setup.total });
    return (
      <div
        className="game-turn-hud is-setup flex h-10 items-center px-4 text-center text-[#f6e6b8]"
        aria-label={`${t("phase.setup")}. ${stepLabel}`}
      >
        <div className="game-setup-heading whitespace-nowrap text-sm font-black uppercase leading-none">{compactLabel}</div>
      </div>
    );
  }

  return (
    <div
      className={[
        "game-turn-hud flex h-10 items-center gap-3 px-4 text-center text-[#f6e6b8]",
        hostTurn ? "is-host-turn" : "",
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
