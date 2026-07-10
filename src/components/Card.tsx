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
  actionable?: boolean;
  linkLabel?: string;
  onSelect?: () => void;
  onMana?: () => void;
  onPlay?: () => void;
  onLeave?: () => void;
  playDisabled?: boolean;
};

export function Card({ game, card, selected, attacking, blocking, compact, accentColor, selectionDisabled, muted, actionable, linkLabel, onSelect, onMana, onPlay, onLeave, playDisabled }: Props) {
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const focusedCardId = useGameStore((state) => state.focusedCardId);
  const stats = cardStats(game, card);
  const { imageUrl } = useCardDetails(card.definitionId);
  const canMana = card.activatedAbilities.some((ability) => ability.effect.type === "ADD_MANA" || ability.effect.type === "ADD_MANA_DYNAMIC");
  const manaDisabled = card.tapped || (card.cardTypes.includes("Creature") && card.summoningSickness);
  const showPlayMenu = focusedCardId === card.instanceId && Boolean(onPlay);
  const selectedGlow = selected
    ? "inset 0 0 0 1px rgba(255,236,184,0.82), 0 0 8px rgba(246,215,125,0.82), 0 0 18px rgba(246,177,59,0.48)"
    : "";
  const actionGlow = actionable
    ? "inset 0 0 0 1px rgba(208,247,255,0.65), 0 0 8px rgba(49,196,255,0.8), 0 0 18px rgba(49,196,255,0.48)"
    : "";
  const style = accentColor || actionable || selected
    ? ({
        borderColor: selected ? "#f6d77d" : accentColor ?? "rgb(102 216 255 / 0.9)",
        boxShadow: [selectedGlow, !selected && accentColor ? `inset 0 0 0 1px ${accentColor}55` : "", !selected ? actionGlow : ""].filter(Boolean).join(", "),
      } satisfies CSSProperties)
    : undefined;
  return (
    <article
      data-card-id={card.instanceId}
      data-audio-click={selectionDisabled ? undefined : "valid"}
      role={selectionDisabled ? undefined : "button"}
      aria-disabled={selectionDisabled ? "true" : undefined}
      onMouseEnter={() => setHoveredCardId(card.instanceId)}
      onMouseLeave={() => {
        setHoveredCardId(undefined);
        onLeave?.();
      }}
      onClick={() => {
        setFocusedCardId(card.instanceId);
        if (!selectionDisabled) onSelect?.();
      }}
      style={style}
      className={[
        "group relative flex h-full w-full aspect-[488/680] min-h-28 flex-col overflow-hidden rounded-md border bg-stone-900 text-left shadow-lg shadow-black/30 transition",
        selected && !accentColor && !actionable ? "border-[#f6d77d]" : "border-transparent",
        card.tapped ? "rotate-2 opacity-80" : "",
        attacking ? "border-[#ff7a3d]" : "",
        compact ? "min-h-24" : "",
        actionable ? "card-actionable" : "",
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
        {card.tapped && <span className="rounded-sm bg-[#21130b]/85 px-1 py-0.5 text-[10px] font-bold uppercase text-[#ffe6aa]">Tapped</span>}
        {attacking && <span className="rounded-sm bg-[#7b2513]/90 px-1 py-0.5 text-[10px] font-bold uppercase text-[#ffe6aa]">Atk</span>}
        {blocking && <span className="rounded-sm bg-[#5b421f]/90 px-1 py-0.5 text-[10px] font-bold uppercase text-[#ffe6aa]">Blk</span>}
        {linkLabel && (
          <span className="rounded-sm px-1.5 py-0.5 text-[12px] font-black text-white shadow" style={{ backgroundColor: accentColor ?? "#2563eb" }}>
            {linkLabel}
          </span>
        )}
      </div>
      {stats && <span className="absolute bottom-1 right-1 border border-[#6b441f] bg-[#f2d793]/95 px-1.5 py-0.5 text-xs font-bold text-[#241106]">{stats}</span>}
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
        <div className="old-panel absolute left-1/2 top-1/2 z-20 w-28 -translate-x-1/2 -translate-y-1/2 p-1">
          <button disabled={playDisabled} className="old-button-green w-full px-3 py-2 text-sm font-black uppercase tracking-wide disabled:text-[#7a6242] disabled:brightness-50" onClick={(event) => buttonClick(event, onPlay!)}>
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
