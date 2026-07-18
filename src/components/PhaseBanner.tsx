import { useEffect, useMemo, useState } from "react";
import type { GameState } from "../engine/GameTypes";

type BannerTone = "main" | "battle" | "defend" | "horde";

type BannerState = {
  key: string;
  label: string;
  tone: BannerTone;
};

const BANNER_DURATION_MS = 1050;

// Written as literal class names (not `phase-banner-${tone}`) so Tailwind's content scanner can
// see them — a dynamically-interpolated string never appears as a full class name in the source,
// so the @layer components rules for these tones get purged from the build otherwise.
const TONE_CLASS: Record<BannerTone, string> = {
  main: "phase-banner-main",
  battle: "phase-banner-battle",
  defend: "phase-banner-defend",
  horde: "phase-banner-horde",
};

export function PhaseBanner({ game, suspended = false }: { game: GameState; suspended?: boolean }) {
  const phase = useMemo(() => getBannerState(game), [game.activeSide, game.phase, game.combat.hordeAttackers.length, game.setupTurnsRemaining, game.turnNumber, game.winner]);
  const [visiblePhase, setVisiblePhase] = useState<BannerState | undefined>();

  useEffect(() => {
    if (suspended) {
      setVisiblePhase(undefined);
      return;
    }
    if (!phase) {
      setVisiblePhase(undefined);
      return;
    }
    setVisiblePhase(phase);
    const timer = window.setTimeout(() => setVisiblePhase(undefined), BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase?.key, suspended]);

  if (!visiblePhase) return null;

  return (
    <div className="phase-banner-shell pointer-events-none fixed inset-0 z-[98] flex items-center justify-center">
      <div className={["phase-banner", TONE_CLASS[visiblePhase.tone]].join(" ")} key={visiblePhase.key}>
        <span className="phase-banner-edge-frame" />
        <span className="phase-banner-text">{visiblePhase.label}</span>
      </div>
    </div>
  );
}

function getBannerState(game: GameState): BannerState | undefined {
  if (game.winner) return undefined;
  if (game.activeSide === "player" && game.phase === "main" && game.setupTurnsRemaining > 0) {
    if (game.turnNumber === 1) return { key: `setup-main-${game.turnNumber}`, label: "Main Phase", tone: "main" };
    if (game.setupTurnsRemaining === 1) return { key: `setup-last-extra-${game.turnNumber}`, label: "Last Extra Turn", tone: "main" };
    return { key: `setup-extra-${game.turnNumber}`, label: "Extra Turn", tone: "main" };
  }
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
