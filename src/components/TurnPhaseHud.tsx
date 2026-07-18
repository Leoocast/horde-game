import type { GameState } from "../engine/GameTypes";

export function TurnPhaseHud({ game }: { game: GameState }) {
  const hordeReady = game.activeSide === "horde" && game.phase === "horde" && game.combat.hordeAttackers.length === 0;
  const owner = game.activeSide === "horde" && game.phase !== "end" && !hordeReady ? "Horde Turn" : "Chronicler Turn";
  const setupActive = game.activeSide === "player" && game.setupTurnsRemaining > 0;
  const phase = setupActive ? "Setup" : hordeReady ? "End" : game.phase === "horde" ? "Main" : game.phase;
  const hordeTurn = game.activeSide === "horde" && !hordeReady;
  const footer = setupActive ? `Turn left: ${game.setupTurnsRemaining}` : `Turn ${game.turnNumber}`;
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
      <div className="game-turn-count whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em]">{footer}</div>
    </div>
  );
}
