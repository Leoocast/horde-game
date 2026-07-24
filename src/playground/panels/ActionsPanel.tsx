import { BatteryCharging, ChevronRight, FastForward, Hand, Plus, Skull, SkipForward, Sparkles, Trash2, Zap, ZapOff } from "lucide-react";
import type { ReactNode } from "react";
import { MAX_PLAYER_LANDS, playerLandCount } from "../../engine/GameRules";
import type { CardInstance } from "../../engine/GameTypes";
import { STORED_MANA_CAP } from "../../engine/ManaSystem";
import { useGameStore } from "../../store/useGameStore";
import type { TimelineStep } from "../timeline";

type Props = {
  /** Every action goes through the timeline so it is executed and recorded by the same call. */
  onDispatch: (step: TimelineStep) => void;
  onInvalid: (reason: string) => void;
};

export function ActionsPanel({ onDispatch, onInvalid }: Props) {
  const game = useGameStore((state) => state.game);
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);

  const selectedPermanentId = selectedPlayerCreatureId ?? selectedHordeCreatureId;
  const handCard = game.player.hand.find((card) => card.instanceId === selectedHandId);
  const permanent = [...game.player.battlefield, ...game.horde.battlefield].find((card) => card.instanceId === selectedPermanentId);

  const sources = playerLandCount(game);
  const available = game.player.battlefield.filter(
    (card) => card.cardTypes.includes("Land") && !card.tapped && !card.activatedThisTurn,
  ).length;
  const stored = game.player.manaPool.colorless;

  function playSelected(free: boolean) {
    if (!handCard) {
      onInvalid("Select a card in hand first (click it on the board).");
      return;
    }
    onDispatch({ kind: "play", handId: handCard.instanceId, cardName: handCard.name, free });
  }

  return (
    <div className="playground-panel">
      <Group title="Turn flow" hint="Moves the real turn structure — the same calls the phase orb makes.">
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "advancePhase" })}>
            <ChevronRight size={14} /> Next phase
          </button>
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "endTurn" })}>
            <SkipForward size={14} /> Next turn
          </button>
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "hordeTurn" })}>
            <Skull size={14} /> Horde turn
          </button>
        </div>
      </Group>

      <Group
        title="Energy"
        badge={`${available}/${sources} ready · ${stored}/${STORED_MANA_CAP} stored`}
        hint={`Energy is an untapped land. Sources cap at ${MAX_PLAYER_LANDS}; stored energy caps at ${STORED_MANA_CAP}.`}
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

      <Group title="Cards" hint="Draw comes off the top of the real library.">
        <div className="playground-button-row">
          <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "draw" })}>
            <Hand size={14} /> Draw card
          </button>
        </div>
      </Group>

      <Group title={`Event queue (${game.eventQueue.length})`} hint="Step the engine's own queue to watch a trigger resolve on its own.">
        <div className="playground-button-row">
          <button className="playground-button" type="button" disabled={game.eventQueue.length === 0} onClick={() => onDispatch({ kind: "resolveNextEvent" })}>
            <ChevronRight size={14} /> Resolve next
          </button>
          <button className="playground-button" type="button" disabled={game.eventQueue.length === 0} onClick={() => onDispatch({ kind: "resolveAllEvents" })}>
            <FastForward size={14} /> Resolve all
          </button>
        </div>
      </Group>

      <Group title="Selection" hint="Click a card on the board to select it — these buttons act on that selection.">
        <SelectionLine label="In hand" card={handCard} />
        <SelectionLine label="On board" card={permanent} />
        <div className="playground-button-row">
          <button className="playground-button is-primary" type="button" disabled={!handCard} onClick={() => playSelected(false)}>
            <Sparkles size={14} /> Play
          </button>
          <button className="playground-button" type="button" disabled={!handCard} onClick={() => playSelected(true)}>
            <Zap size={14} /> Play free
          </button>
        </div>
        <div className="playground-button-row">
          <button
            className="playground-button"
            type="button"
            disabled={!permanent}
            onClick={() =>
              permanent
                ? onDispatch({ kind: "destroy", cardId: permanent.instanceId, cardName: permanent.name })
                : onInvalid("Select a permanent on the board first.")
            }
          >
            <Skull size={14} /> Destroy
          </button>
          <button
            className="playground-button"
            type="button"
            disabled={!permanent && !handCard}
            onClick={() => {
              const card = permanent ?? handCard;
              if (!card) {
                onInvalid("Select a card on the board or in hand first.");
                return;
              }
              onDispatch({ kind: "toGraveyard", cardId: card.instanceId, cardName: card.name });
            }}
          >
            <Trash2 size={14} /> To graveyard
          </button>
        </div>
        <p className="playground-note">
          <strong>Play free</strong> tops the pool up to the printed cost and then casts normally: the
          cost check, timing and targeting all still run. <strong>Destroy</strong> runs real death
          triggers; <strong>To graveyard</strong> is a raw zone move that runs none.
        </p>
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

function SelectionLine({ label, card }: { label: string; card?: CardInstance }) {
  return (
    <div className={`playground-selection-line ${card ? "" : "is-empty"}`}>
      <span>{label}</span>
      <strong>{card ? card.name : "nothing selected"}</strong>
    </div>
  );
}
