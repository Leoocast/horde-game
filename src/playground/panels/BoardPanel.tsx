import { Eraser, Skull, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { CardInstance } from "../../engine/GameTypes";
import { useGameStore } from "../../store/useGameStore";
import type { TimelineStep } from "../timeline";

type Props = {
  /** Every action goes through the timeline so it is executed and recorded by the same call. */
  onDispatch: (step: TimelineStep) => void;
  onInvalid: (reason: string) => void;
};

/**
 * Taking things off the board. The selection comes from the store, which means the card is chosen
 * by clicking it on the real battlefield — no second list to keep in sync with what is in play.
 */
export function BoardPanel({ onDispatch, onInvalid }: Props) {
  const game = useGameStore((state) => state.game);
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);

  const handCard = game.player.hand.find((card) => card.instanceId === selectedHandId);
  const permanent = [...game.player.battlefield, ...game.horde.battlefield].find(
    (card) => card.instanceId === (selectedPlayerCreatureId ?? selectedHordeCreatureId),
  );
  const target = permanent ?? handCard;

  return (
    <div className="playground-panel">
      <Group title="Selected" hint="Click a card on the board or in your hand. These buttons act on it.">
        <SelectionLine label="On board" card={permanent} />
        <SelectionLine label="In hand" card={handCard} />

        <div className="playground-button-row">
          <button
            className="playground-button"
            type="button"
            disabled={!permanent}
            title="Real destruction: death triggers fire"
            onClick={() =>
              permanent
                ? onDispatch({ kind: "destroy", cardId: permanent.instanceId, cardName: permanent.name })
                : onInvalid("Select a permanent on the board first.")
            }
          >
            <Skull size={14} /> Kill it
          </button>
          <button
            className="playground-button"
            type="button"
            disabled={!target}
            title="Raw zone move: nothing dies, no triggers"
            onClick={() =>
              target
                ? onDispatch({ kind: "toGraveyard", cardId: target.instanceId, cardName: target.name })
                : onInvalid("Select a card on the board or in hand first.")
            }
          >
            <Trash2 size={14} /> Remove it
          </button>
        </div>
        <p className="playground-hint">
          <strong>Kill it</strong> is a real death — anything watching creatures die will react.{" "}
          <strong>Remove it</strong> just moves the card to the graveyard, so nothing notices. The
          difference is the whole point: use Kill to test a death trigger, Remove to tidy up.
        </p>
      </Group>

      <Group title="Wipe" hint="Silent: everything goes to the graveyard without dying, so clearing the table never fires a dozen triggers.">
        <div className="playground-button-row">
          <button
            className="playground-button"
            type="button"
            disabled={game.player.battlefield.length === 0}
            onClick={() => onDispatch({ kind: "clearBattlefield", side: "player" })}
          >
            <Eraser size={14} /> Your board ({game.player.battlefield.length})
          </button>
          <button
            className="playground-button"
            type="button"
            disabled={game.horde.battlefield.length === 0}
            onClick={() => onDispatch({ kind: "clearBattlefield", side: "horde" })}
          >
            <Eraser size={14} /> Horde board ({game.horde.battlefield.length})
          </button>
        </div>
      </Group>
    </div>
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

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="playground-group">
      <header className="playground-group-head">
        <span className="playground-group-title">{title}</span>
      </header>
      {children}
      {hint && <p className="playground-hint">{hint}</p>}
    </section>
  );
}
