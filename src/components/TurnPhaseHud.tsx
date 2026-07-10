import type { GameState } from "../engine/GameTypes";

export function TurnPhaseHud({ game }: { game: GameState }) {
  const hordeReady = game.activeSide === "horde" && game.phase === "horde" && game.combat.hordeAttackers.length === 0;
  const owner = game.activeSide === "horde" && !hordeReady ? "Horde Turn" : "Player Turn";
  const setupActive = game.activeSide === "player" && game.setupTurnsRemaining > 0;
  const phase = setupActive ? "Setup" : hordeReady ? "End" : game.phase === "horde" ? "Main" : game.phase;
  const hordeTurn = game.activeSide === "horde" && !hordeReady;
  const footer = setupActive ? `Turn left: ${game.setupTurnsRemaining}` : `Turn ${game.turnNumber}`;
  return (
    <div
      className={[
        "old-panel-soft flex h-10 items-center gap-3 px-4 text-center text-[#f6e6b8]",
        hordeTurn ? "outline outline-1 outline-[#c14f2a]" : "",
      ].join(" ")}
    >
      <div className={["old-title whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.16em]", hordeTurn ? "text-[#ffb36b]" : ""].join(" ")}>{owner}</div>
      <div className="h-4 w-px bg-[#b88945]/45" />
      <div className="whitespace-nowrap text-sm font-black capitalize leading-none text-[#fff0b2]">{phase}</div>
      <div className="h-4 w-px bg-[#b88945]/45" />
      <div className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-[#d6b879]">{footer}</div>
    </div>
  );
}
