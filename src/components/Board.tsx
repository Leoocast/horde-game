import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { Battlefield } from "./Battlefield";
import { CardPreview } from "./CardPreview";
import { CombatArrows } from "./CombatArrows";
import { DuelHud, PlayerLifePanel } from "./DuelHud";
import { GameStatusBadge } from "./GameStatusBadge";
import { Hand } from "./Hand";
import { HordeAttackAnimator } from "./HordeAttackAnimator";
import { InfoMenu } from "./InfoMenu";
import { MusicPlayerMenu } from "./MusicPlayerMenu";
import { PhaseOrb } from "./PhaseOrb";
import { PlayerAttackAnimator } from "./PlayerAttackAnimator";
import { TurnPhaseHud } from "./TurnPhaseHud";
import { DefeatModal } from "./DefeatModal";

type Props = {
  playerName: string;
  setupTurns: number;
};

export function Board({ playerName, setupTurns }: Props) {
  const game = useGameStore((state) => state.game);
  const setMusicVariant = useAudioStore((state) => state.setMusicVariant);

  useEffect(() => {
    setMusicVariant(game.player.life <= 10 ? "climax" : "battle");
  }, [game.player.life, setMusicVariant]);

  return (
    <main className="duel-table h-screen overflow-hidden">
      <header className="old-frame-top relative z-[90] grid h-14 grid-cols-[minmax(280px,1fr)_auto_minmax(48px,1fr)] items-center gap-2 px-0 py-0 text-[#f8dfa0]">
        <GameStatusBadge game={game} />
        <TurnPhaseHud game={game} />
        <div className="flex items-center gap-2 pr-3 justify-self-end">
          <MusicPlayerMenu />
          <InfoMenu setupTurns={setupTurns} />
        </div>
      </header>
      <DuelHud game={game} />
      <PhaseOrb game={game} />
      <CombatArrows game={game} />
      <HordeAttackAnimator />
      <PlayerAttackAnimator />
      <CardPreview />
      <PlayerLifePanel game={game} playerName={playerName} />
      <div className="grid h-[calc(100vh-56px)] grid-cols-1 items-start gap-3 overflow-hidden px-3 pb-56 pt-3">
        <section className="old-panel space-y-3 p-3">
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
