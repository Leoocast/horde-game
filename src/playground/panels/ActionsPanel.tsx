import { BatteryCharging, ChevronRight, Hand, Plus, SkipForward, Skull, Zap, ZapOff } from "lucide-react";
import type { ReactNode } from "react";
import { MAX_PLAYER_LANDS, playerLandCount } from "../../engine/GameRules";
import { STORED_ENERGY_CAP } from "../../engine/EnergySystem";
import { useGameStore } from "../../store/useGameStore";
import type { TimelineStep } from "../timeline";

type Props = {
  /** Every action goes through the timeline so it is executed and recorded by the same call. */
  onDispatch: (step: TimelineStep) => void;
};

export function ActionsPanel({ onDispatch }: Props) {
  const game = useGameStore((state) => state.game);

  const sources = playerLandCount(game);
  const available = game.player.field.filter(
    (card) => card.kinds.includes("SOURCE") && !card.exhausted && !card.activatedThisTurn,
  ).length;
  const stored = game.player.energyPool.stored;

  return (
    <div className="playground-panel">
      <Group title="Turn flow">
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "advancePhase" })}>
            <ChevronRight size={14} /> Next phase
          </button>
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "endTurn" })}>
            <SkipForward size={14} /> Next turn
          </button>
        </div>
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "hostTurn" })}>
            <Skull size={14} /> Host turn
          </button>
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "draw" })}>
            <Hand size={14} /> Draw card
          </button>
        </div>
      </Group>

      <Group
        title="Energy"
        badge={`${available}/${sources} ready · ${stored}/${STORED_ENERGY_CAP} stored`}
      >
        <div className="playground-meter" aria-label={`${available} of ${sources} energy ready`}>
          {Array.from({ length: MAX_PLAYER_LANDS }).map((_, index) => (
            <span
              key={`source-${index}`}
              className={`playground-pip ${index < available ? "is-ready" : index < sources ? "is-spent" : "is-empty"}`}
            />
          ))}
          <span className="playground-meter-split" />
          {Array.from({ length: STORED_ENERGY_CAP }).map((_, index) => (
            <span key={`stored-${index}`} className={`playground-pip is-stored ${index < stored ? "is-ready" : "is-empty"}`} />
          ))}
        </div>
        <div className="playground-button-row">
          <button
            className="playground-button is-primary"
            type="button"
            disabled={sources >= MAX_PLAYER_LANDS}
            title="Invokes one more Ready Source onto the Field"
            onClick={() => onDispatch({ kind: "addEnergySource" })}
          >
            <Plus size={14} /> Add source
          </button>
          <button
            className="playground-button"
            type="button"
            title="Readies every Source and restores the Energy Action"
            onClick={() => onDispatch({ kind: "refillEnergy" })}
          >
            <BatteryCharging size={14} /> Refill
          </button>
        </div>
        <div className="playground-button-row">
          <button
            className="playground-button"
            type="button"
            disabled={stored >= STORED_ENERGY_CAP}
            onClick={() => onDispatch({ kind: "addStoredEnergy" })}
          >
            <Zap size={14} /> +1 stored
          </button>
          <button className="playground-button" type="button" title="Exhausts every Source and empties stored Energy" onClick={() => onDispatch({ kind: "drainEnergy" })}>
            <ZapOff size={14} /> Drain all
          </button>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <section className="playground-group">
      <header className="playground-group-head">
        <span className="playground-group-title">{title}</span>
        {badge && <span className="playground-group-badge">{badge}</span>}
      </header>
      {children}
    </section>
  );
}
