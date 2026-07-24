import type { CardInstance, Color } from "../../engine/GameTypes";
import { useGameStore } from "../../store/useGameStore";
import type { TimelineStep } from "../timeline";

const MANA_BUTTONS: Array<{ color: Color; label: string }> = [
  { color: "G", label: "G" },
  { color: "R", label: "R" },
  { color: "U", label: "U" },
  { color: "W", label: "W" },
  { color: "B", label: "B" },
  { color: "C", label: "C" },
];

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

  function playSelected(free: boolean) {
    if (!handCard) {
      onInvalid("Select a card in hand first (click it on the board).");
      return;
    }
    onDispatch({ kind: "play", handId: handCard.instanceId, cardName: handCard.name, free });
  }

  return (
    <div className="playground-section">
      <div className="playground-section-title">Flow</div>
      <div className="playground-button-row">
        <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "advancePhase" })}>
          Advance phase
        </button>
        <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "endTurn" })}>
          Advance turn
        </button>
      </div>
      <div className="playground-button-row">
        <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "hordeTurn" })}>
          Run Horde turn
        </button>
      </div>

      <div className="playground-section-title">Events ({game.eventQueue.length})</div>
      <div className="playground-button-row">
        <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "resolveNextEvent" })}>
          Resolve next
        </button>
        <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "resolveAllEvents" })}>
          Resolve all
        </button>
      </div>

      <div className="playground-section-title">Resources</div>
      <div className="playground-button-row">
        <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "draw" })}>
          Draw card
        </button>
        <button className="playground-button" type="button" onClick={() => onDispatch({ kind: "clearMana" })}>
          Clear mana
        </button>
      </div>
      <div className="playground-mana-row">
        {MANA_BUTTONS.map((entry) => (
          <button
            key={entry.color}
            className="playground-button"
            type="button"
            title={`Add one ${entry.label} mana`}
            onClick={() => onDispatch({ kind: "addMana", color: entry.color })}
          >
            +{entry.label}
          </button>
        ))}
      </div>

      <div className="playground-section-title">Selection</div>
      <SelectionLine label="Hand" card={handCard} />
      <SelectionLine label="Permanent" card={permanent} />
      <div className="playground-button-row">
        <button className="playground-button is-primary" type="button" onClick={() => playSelected(false)}>
          Play card
        </button>
        <button className="playground-button" type="button" onClick={() => playSelected(true)}>
          Play free
        </button>
      </div>
      <div className="playground-button-row">
        <button
          className="playground-button"
          type="button"
          onClick={() =>
            permanent
              ? onDispatch({ kind: "destroy", cardId: permanent.instanceId, cardName: permanent.name })
              : onInvalid("Select a permanent on the board first.")
          }
        >
          Destroy
        </button>
        <button
          className="playground-button"
          type="button"
          onClick={() => {
            const card = permanent ?? handCard;
            if (!card) {
              onInvalid("Select a card on the board or in hand first.");
              return;
            }
            onDispatch({ kind: "toGraveyard", cardId: card.instanceId, cardName: card.name });
          }}
        >
          To graveyard
        </button>
      </div>
      <p className="playground-note">
        Destroy runs real death triggers; To graveyard is a raw zone move that runs none. Play free
        tops the pool up to the printed cost and then casts normally — the cost check, timing and
        targeting all still run.
      </p>
    </div>
  );
}

function SelectionLine({ label, card }: { label: string; card?: CardInstance }) {
  return (
    <div className="playground-selection-line">
      <span>{label}</span>
      <strong>{card ? card.name : "none"}</strong>
    </div>
  );
}
