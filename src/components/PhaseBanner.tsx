import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { setupJustCompleted, setupProgress } from "./setupPresentation";
import { guidedPresentationActivity } from "../guidance";

type BannerTone = "main" | "battle" | "defend" | "host";

type BannerState = {
  key: string;
  label: string;
  tone: BannerTone;
  progress?: Readonly<{
    current: number;
    total: number;
  }>;
};

const BANNER_DURATION_MS = 1320;

// Written as literal class names (not `phase-banner-${tone}`) so Tailwind's content scanner can
// see them — a dynamically-interpolated string never appears as a full class name in the source,
// so the @layer components rules for these tones get purged from the build otherwise.
const TONE_CLASS: Record<BannerTone, string> = {
  main: "phase-banner-main",
  battle: "phase-banner-battle",
  defend: "phase-banner-defend",
  host: "phase-banner-host",
};

export function PhaseBanner({ game, setupTurns, suspended = false }: { game: GameState; setupTurns: number; suspended?: boolean }) {
  const t = useTranslation();
  const phase = useMemo(() => getBannerState(game, setupTurns, t), [game.activeSide, game.phase, game.combat.hostAttackers.length, game.setupTurnsRemaining, game.turnNumber, game.winner, setupTurns, t]);
  const [visiblePhase, setVisiblePhase] = useState<BannerState | undefined>();
  const previousSetup = useRef({ remaining: game.setupTurnsRemaining, seed: game.seed });

  useEffect(() => {
    const setupAwakened = previousSetup.current.seed === game.seed && setupJustCompleted(
      previousSetup.current.remaining,
      game.setupTurnsRemaining,
    );
    previousSetup.current = { remaining: game.setupTurnsRemaining, seed: game.seed };
    if (suspended) {
      setVisiblePhase(undefined);
      return;
    }
    const nextPhase = setupAwakened
      ? { key: `setup-awakens-${game.turnNumber}`, label: t("phase.hostAwakens"), tone: "host" as const }
      : phase;
    if (!nextPhase) {
      setVisiblePhase(undefined);
      return;
    }
    const activity = guidedPresentationActivity.begin("phase.banner", nextPhase.key);
    setVisiblePhase(nextPhase);
    const timer = window.setTimeout(() => {
      setVisiblePhase(undefined);
      activity.end();
    }, BANNER_DURATION_MS);
    return () => {
      window.clearTimeout(timer);
      activity.end();
    };
  }, [game.seed, game.setupTurnsRemaining, game.turnNumber, phase, suspended, t]);

  if (!visiblePhase) return null;

  return (
    <div className="phase-banner-shell pointer-events-none fixed inset-0 z-[98] flex items-center justify-center">
      <div className={["phase-banner", TONE_CLASS[visiblePhase.tone], game.gameMode === "chaos" ? "is-chaos" : ""].join(" ")} key={visiblePhase.key}>
        <span className="phase-banner-line phase-banner-line-left" />
        <span className="phase-banner-copy">
          <span className="phase-banner-edge-frame" />
          <span className="phase-banner-text">
            <span>{visiblePhase.label}</span>
            {visiblePhase.progress && (
              <>
                {" "}
                <span className="phase-banner-count">
                  {visiblePhase.progress.current}/{visiblePhase.progress.total}
                </span>
              </>
            )}
          </span>
        </span>
        <span className="phase-banner-line phase-banner-line-right" />
      </div>
    </div>
  );
}

function getBannerState(game: GameState, setupTurns: number, t: ReturnType<typeof useTranslation>): BannerState | undefined {
  if (game.winner) return undefined;
  if (game.activeSide === "player" && game.phase === "main" && game.setupTurnsRemaining > 0) {
    const setup = setupProgress(setupTurns, game.setupTurnsRemaining);
    if (setup) {
      return {
        key: `setup-step-${setup.current}-of-${setup.total}`,
        label: t("phase.setup"),
        tone: "main",
        progress: { current: setup.current, total: setup.total },
      };
    }
  }
  if (game.activeSide === "host" && game.combat.hostAttackers.length > 0) {
    return { key: `host-defend-${game.turnNumber}-${game.combat.hostAttackers.length}`, label: t("phase.defendPhase"), tone: "defend" };
  }
  if (game.activeSide === "player" && game.phase === "main") {
    return { key: `player-main-${game.turnNumber}`, label: t("phase.mainPhase"), tone: "main" };
  }
  if (game.activeSide === "player" && game.phase === "combat") {
    return { key: `player-battle-${game.turnNumber}`, label: t("phase.battlePhase"), tone: "battle" };
  }
  if (game.activeSide === "host" && game.phase === "host") {
    return { key: `host-main-${game.turnNumber}`, label: t("phase.hostPhase"), tone: "host" };
  }
  if (game.phase === "end") {
    return { key: `${game.activeSide}-end-${game.turnNumber}`, label: t("phase.endPhase"), tone: game.activeSide === "host" ? "host" : "main" };
  }
  return undefined;
}
