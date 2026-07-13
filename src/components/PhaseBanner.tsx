import { useEffect, useMemo, useState } from "react";
import type { GameState } from "../engine/GameTypes";

type BannerTone = "main" | "battle" | "defend" | "horde";

type BannerState = {
  key: string;
  label: string;
  tone: BannerTone;
};

const BANNER_DURATION_MS = 1250;

export function PhaseBanner({ game }: { game: GameState }) {
  const phase = useMemo(() => getBannerState(game), [game.activeSide, game.phase, game.combat.hordeAttackers.length, game.setupTurnsRemaining, game.turnNumber, game.winner]);
  const [visiblePhase, setVisiblePhase] = useState<BannerState | undefined>();

  useEffect(() => {
    if (!phase) {
      setVisiblePhase(undefined);
      return;
    }
    setVisiblePhase(phase);
    const timer = window.setTimeout(() => setVisiblePhase(undefined), BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase?.key]);

  if (!visiblePhase) return null;

  return (
    <div className="phase-banner-shell pointer-events-none fixed inset-x-0 top-[82px] z-[78] flex justify-center">
      <div className={["phase-banner", `phase-banner-${visiblePhase.tone}`].join(" ")} key={visiblePhase.key}>
        <span className="phase-banner-edge phase-banner-edge-left" />
        <span className="phase-banner-text">{visiblePhase.label}</span>
        <span className="phase-banner-edge phase-banner-edge-right" />
      </div>
    </div>
  );
}

function getBannerState(game: GameState): BannerState | undefined {
  if (game.winner) return undefined;
  if (game.setupTurnsRemaining > 0) return undefined;
  if (game.activeSide === "horde" && game.combat.hordeAttackers.length > 0) {
    return { key: `horde-defend-${game.turnNumber}-${game.combat.hordeAttackers.length}`, label: "Defend Phase", tone: "defend" };
  }
  if (game.activeSide === "player" && game.phase === "main") {
    return { key: `player-main-${game.turnNumber}`, label: "Main Phase", tone: "main" };
  }
  if (game.activeSide === "player" && game.phase === "combat") {
    return { key: `player-battle-${game.turnNumber}`, label: "Battle Phase", tone: "battle" };
  }
  if (game.activeSide === "horde" && game.phase === "horde") {
    return { key: `horde-main-${game.turnNumber}`, label: "Main Phase", tone: "horde" };
  }
  return undefined;
}
