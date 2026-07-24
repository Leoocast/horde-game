import { BatteryCharging, ChevronRight, Hand, Plus, SkipForward, Skull, Zap, ZapOff } from "lucide-react";
import type { ReactNode } from "react";
import { MAX_PLAYER_LANDS, playerLandCount } from "../../engine/GameRules";
import { STORED_MANA_CAP } from "../../engine/ManaSystem";
import { useGameStore } from "../../store/useGameStore";
import type { TimelineStep } from "../timeline";

type Props = {
  /** Every action goes through the timeline so it is executed and recorded by the same call. */
  onDispatch: (step: TimelineStep) => void;
};

export function ActionsPanel({ onDispatch }: Props) {
  const game = useGameStore((state) => state.game);

  const sources = playerLandCount(game);
  const available = game.player.battlefield.filter(
    (card) => card.cardTypes.includes("Land") && !card.tapped && !card.activatedThisTurn,
  ).length;
  const stored = game.player.manaPool.colorless;

  return (
    <div className="playground-panel">
      <Group title="Turn flow" hint="The same calls the phase orb and the Horde's turn make — nothing here skips a step.">
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "advancePhase" })}>
            <ChevronRight size={14} /> Next phase
          </button>
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "endTurn" })}>
            <SkipForward size={14} /> Next turn
          </button>
        </div>
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "hordeTurn" })}>
            <Skull size={14} /> Horde turn
          </button>
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "draw" })}>
            <Hand size={14} /> Draw card
          </button>
        </div>
      </Group>

      <Group
        title="Energy"
        badge={`${available}/${sources} ready · ${stored}/${STORED_MANA_CAP} stored`}
        hint={`Energy is an untapped land. Sources cap at ${MAX_PLAYER_LANDS}; the stored reserve caps at ${STORED_MANA_CAP}.`}
      >
        <div className="playground-meter" aria-label={`${available} of ${sources} energy ready`}>
          {Array.from({ length: MAX_PLAYER_LANDS }).map((_, index) => (
            <span
              key={`source-${index}`}
              className={`playground-pip ${index < available ? "is-ready" : index < sources ? "is-spent" : "is-empty"}`}
            />
          ))}
          <span className="playground-meter-split" />
          {Array.from({ length: STORED_MANA_CAP }).map((_, index) => (
            <span key={`stored-${index}`} className={`playground-pip is-stored ${index < stored ? "is-ready" : "is-empty"}`} />
          ))}
        </div>
        <div className="playground-button-row">
          <button
            className="playground-button is-primary"
            type="button"
            disabled={sources >= MAX_PLAYER_LANDS}
            title="Puts one more untapped land on the battlefield"
            onClick={() => onDispatch({ kind: "addEnergySource" })}
          >
            <Plus size={14} /> Add source
          </button>
          <button
            className="playground-button"
            type="button"
            title="Untaps every land and gives the Energy action back"
            onClick={() => onDispatch({ kind: "refillEnergy" })}
          >
            <BatteryCharging size={14} /> Refill
          </button>
        </div>
        <div className="playground-button-row">
          <button
            className="playground-button"
            type="button"
            disabled={stored >= STORED_MANA_CAP}
            onClick={() => onDispatch({ kind: "addStoredEnergy" })}
          >
            <Zap size={14} /> +1 stored
          </button>
          <button className="playground-button" type="button" title="Taps every land and empties the pool" onClick={() => onDispatch({ kind: "drainEnergy" })}>
            <ZapOff size={14} /> Drain all
          </button>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, badge, hint, children }: { title: string; badge?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="playground-group">
      <header className="playground-group-head">
        <span className="playground-group-title">{title}</span>
        {badge && <span className="playground-group-badge">{badge}</span>}
      </header>
      {children}
      {hint && <p className="playground-hint">{hint}</p>}
    </section>
  );
}
