import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { AppHeader } from "./AppHeader";
import { Battlefield } from "./Battlefield";
import { CardContextMenu } from "./CardContextMenu";
import { CardPreview } from "./CardPreview";
import { CombatArrows } from "./CombatArrows";
import { CounterTargetingOverlay } from "./CounterTargetingOverlay";
import { DuelHud, PlayerLifePanel } from "./DuelHud";
import { GameStatusBadge } from "./GameStatusBadge";
import { Hand } from "./Hand";
import { HordeAttackAnimator } from "./HordeAttackAnimator";
import { InfoMenu } from "./InfoMenu";
import { PhaseOrb } from "./PhaseOrb";
import { PlayerAttackAnimator } from "./PlayerAttackAnimator";
import { SpellFightAnimator } from "./SpellFightAnimator";
import { SpellTargetingOverlay } from "./SpellTargetingOverlay";
import { ToastStack } from "./ToastStack";
import { TurnPhaseHud } from "./TurnPhaseHud";
import { DefeatModal } from "./DefeatModal";

type Props = {
  playerName: string;
  setupTurns: number;
};

export function Board({ playerName, setupTurns }: Props) {
  const game = useGameStore((state) => state.game);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const selectActiveEffectCard = useGameStore((state) => state.selectActiveEffectCard);
  const setMusicVariant = useAudioStore((state) => state.setMusicVariant);

  useEffect(() => {
    setMusicVariant(game.player.life <= 10 ? "climax" : "battle");
  }, [game.player.life, setMusicVariant]);

  return (
    <main className="duel-table h-screen overflow-hidden">
      <AppHeader left={<GameStatusBadge game={game} />} center={<TurnPhaseHud game={game} />} right={<InfoMenu setupTurns={setupTurns} />} showSettings={false} />
      <DuelHud game={game} />
      <PhaseOrb game={game} />
      <CombatArrows game={game} />
      <CounterTargetingOverlay game={game} />
      <SpellTargetingOverlay game={game} />
      <HordeAttackAnimator />
      <PlayerAttackAnimator />
      <SpellFightAnimator />
      {(activeEffectCardId || closingEffectCardId) && (
        <div data-audio-click="off" className={["effect-focus-backdrop", closingEffectCardId ? "effect-focus-backdrop-closing" : ""].join(" ")} onClick={() => selectActiveEffectCard(undefined)} />
      )}
      <CardPreview />
      <CardContextMenu />
      <PlayerLifePanel game={game} playerName={playerName} />
      <ToastStack />
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
