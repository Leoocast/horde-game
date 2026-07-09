import { useGameStore } from "../store/useGameStore";
import { Battlefield } from "./Battlefield";
import { CardPreview } from "./CardPreview";
import { CombatArrows } from "./CombatArrows";
import { DuelHud, PlayerLifePanel } from "./DuelHud";
import { GameStatusBadge } from "./GameStatusBadge";
import { Hand } from "./Hand";
import { InfoMenu } from "./InfoMenu";
import { PhaseOrb } from "./PhaseOrb";
import { TurnPhaseHud } from "./TurnPhaseHud";
import type { DifficultyMode } from "./StartMenu";
import { DefeatModal } from "./DefeatModal";

type Props = {
  playerName: string;
  mode: DifficultyMode;
  setupTurns: number;
};

export function Board({ playerName, mode, setupTurns }: Props) {
  const game = useGameStore((state) => state.game);
  return (
    <main className="duel-table h-screen overflow-hidden text-stone-950">
      <header className="relative z-[90] grid h-14 grid-cols-[minmax(280px,1fr)_auto_minmax(48px,1fr)] items-center gap-2 border-b border-white/10 bg-stone-950/55 px-0 py-0 text-white shadow-2xl shadow-black/20 backdrop-blur-md">
        <GameStatusBadge game={game} />
        <TurnPhaseHud game={game} />
        <div className="pr-3 justify-self-end">
          <InfoMenu game={game} />
        </div>
      </header>
      <DuelHud game={game} />
      <PhaseOrb game={game} />
      <CombatArrows game={game} />
      <div className="grid h-[calc(100vh-56px)] grid-cols-1 items-start gap-3 overflow-hidden p-3 pb-56 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <CardPreview />
          <PlayerLifePanel game={game} playerName={playerName} mode={mode} />
        </aside>
        <section className="space-y-3 rounded-2xl border border-white/15 bg-stone-950/25 p-3 shadow-2xl shadow-black/20 backdrop-blur-md">
          <Battlefield game={game} side="horde" cards={game.horde.battlefield} />
          <Battlefield game={game} side="player" cards={game.player.battlefield} />
        </section>
      </div>
      <Hand game={game} />
      {game.winner === "horde" && <DefeatModal game={game} setupTurns={setupTurns} />}
      {game.winner === "player" && <div className="fixed inset-x-0 bottom-0 z-[120] bg-emerald-700 px-4 py-3 text-center text-lg font-bold text-white">Player wins</div>}
    </main>
  );
}
