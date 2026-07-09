import { Droplets } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { useCardDetails } from "../utils/cardImages";
import { cardStats } from "../utils/selectors";
import { useGameStore } from "../store/useGameStore";

type Props = {
  game: GameState;
  card: CardInstance;
  selected?: boolean;
  attacking?: boolean;
  blocking?: boolean;
  compact?: boolean;
  accentColor?: string;
  selectionDisabled?: boolean;
  muted?: boolean;
  linkLabel?: string;
  onSelect?: () => void;
  onMana?: () => void;
  onPlay?: () => void;
  onLeave?: () => void;
  playDisabled?: boolean;
};

export function Card({ game, card, selected, attacking, blocking, compact, accentColor, selectionDisabled, muted, linkLabel, onSelect, onMana, onPlay, onLeave, playDisabled }: Props) {
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const focusedCardId = useGameStore((state) => state.focusedCardId);
  const stats = cardStats(game, card);
  const { imageUrl } = useCardDetails(card.definitionId);
  const canMana = card.activatedAbilities.some((ability) => ability.effect.type === "ADD_MANA" || ability.effect.type === "ADD_MANA_DYNAMIC");
  const manaDisabled = card.tapped || (card.cardTypes.includes("Creature") && card.summoningSickness);
  const showPlayMenu = focusedCardId === card.instanceId && Boolean(onPlay);
  const style = accentColor
    ? ({
        borderColor: accentColor,
        boxShadow: selected ? `0 0 0 2px ${accentColor}55` : `inset 0 0 0 1px ${accentColor}55`,
      } satisfies CSSProperties)
    : undefined;
  return (
    <article
      data-card-id={card.instanceId}
      onMouseEnter={() => setHoveredCardId(card.instanceId)}
      onMouseLeave={() => {
        setHoveredCardId(undefined);
        if (focusedCardId === card.instanceId) setFocusedCardId(undefined);
        onLeave?.();
      }}
      onClick={
        selectionDisabled
          ? undefined
          : () => {
              setFocusedCardId(card.instanceId);
              onSelect?.();
            }
      }
      style={style}
      className={[
        "group relative flex h-full w-full aspect-[488/680] min-h-28 flex-col overflow-hidden rounded-md border bg-stone-900 text-left shadow-lg shadow-black/30 transition",
        selected && !accentColor ? "border-emerald-400 ring-2 ring-emerald-300/50" : "border-transparent",
        card.tapped ? "rotate-2 opacity-80" : "",
        attacking ? "border-rose-500" : "",
        blocking ? "border-sky-500" : "",
        compact ? "min-h-24" : "",
        selectionDisabled ? "cursor-default" : "cursor-pointer",
        muted ? "opacity-75 saturate-75" : "",
      ].join(" ")}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={card.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-stone-100 p-2 text-center text-xs font-bold text-stone-600">{card.displayName}</div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-stone-950/0 transition group-hover:bg-stone-950/20" />
      <div className="absolute left-1 top-1 flex flex-wrap gap-1">
        {card.tapped && <span className="rounded-sm bg-stone-900/75 px-1 py-0.5 text-[10px] font-bold uppercase text-white">Tapped</span>}
        {attacking && <span className="rounded-sm bg-rose-700/85 px-1 py-0.5 text-[10px] font-bold uppercase text-white">Atk</span>}
        {blocking && <span className="rounded-sm bg-sky-700/85 px-1 py-0.5 text-[10px] font-bold uppercase text-white">Blk</span>}
        {linkLabel && (
          <span className="rounded-sm px-1.5 py-0.5 text-[12px] font-black text-white shadow" style={{ backgroundColor: accentColor ?? "#2563eb" }}>
            {linkLabel}
          </span>
        )}
      </div>
      {stats && <span className="absolute bottom-1 right-1 border border-stone-700 bg-white/90 px-1.5 py-0.5 text-xs font-bold text-stone-950">{stats}</span>}
      <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
        {onMana && canMana && (
          <button
            title={manaDisabled ? "Cannot tap for mana" : "Tap for mana"}
            disabled={manaDisabled}
            onClick={(event) => buttonClick(event, onMana)}
            className="icon-button bg-white/95"
          >
            <Droplets size={14} />
          </button>
        )}
      </div>
      {showPlayMenu && (
        <div className="absolute left-1/2 top-1/2 z-20 w-28 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/20 bg-stone-950/90 p-1 shadow-2xl shadow-black/45">
          <button disabled={playDisabled} className="w-full rounded-lg px-3 py-2 text-sm font-black uppercase tracking-wide text-white hover:bg-emerald-400/20 disabled:text-stone-500 disabled:hover:bg-transparent" onClick={(event) => buttonClick(event, onPlay!)}>
            Play
          </button>
        </div>
      )}
    </article>
  );
}

function buttonClick(event: MouseEvent, action: () => void): void {
  event.stopPropagation();
  action();
}
