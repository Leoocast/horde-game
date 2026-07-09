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
        "flex h-10 items-center gap-3 rounded-full border px-4 text-center text-white shadow-xl shadow-black/20",
        hordeTurn ? "border-rose-300/35 bg-rose-950/75" : "border-white/15 bg-stone-950/65",
      ].join(" ")}
    >
      <div className={["whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.16em]", hordeTurn ? "text-rose-200" : "text-cyan-200"].join(" ")}>{owner}</div>
      <div className="h-4 w-px bg-white/20" />
      <div className="whitespace-nowrap text-sm font-black capitalize leading-none">{phase}</div>
      <div className="h-4 w-px bg-white/20" />
      <div className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-stone-300">{footer}</div>
    </div>
  );
}
