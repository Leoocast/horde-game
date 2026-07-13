import type { CSSProperties, MouseEvent, PointerEvent } from "react";
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
  effectAvailable?: boolean;
  autoPaid?: boolean;
  linkLabel?: string;
  onSelect?: () => void;
  onMana?: () => void;
  onLeave?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  suppressContextMenu?: boolean;
  shouldSuppressClick?: () => boolean;
};

export function Card({ game, card, selected, attacking, blocking, compact, accentColor, selectionDisabled, muted, actionable, effectAvailable, autoPaid, linkLabel, onSelect, onMana, onLeave, onPointerDown, onContextMenu, suppressContextMenu, shouldSuppressClick }: Props) {
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const openCardContextMenu = useGameStore((state) => state.openCardContextMenu);
  const stats = cardStats(game, card);
  const { imageUrl } = useCardDetails(card.definitionId);
  const summoningSick = card.zone === "battlefield" && card.cardTypes.includes("Creature") && card.summoningSickness;
  const showEffectAvailable = Boolean(effectAvailable && !actionable);
  void onMana;
  const selectedGlow = selected
    ? "inset 0 0 0 1px rgba(245,241,226,0.72), 0 0 7px rgba(232,226,205,0.5), 0 0 16px rgba(164,151,126,0.28)"
    : "";
  const actionGlow = actionable
    ? "inset 0 0 0 1px rgba(208,247,255,0.65), 0 0 8px rgba(49,196,255,0.8), 0 0 18px rgba(49,196,255,0.48)"
    : "";
  const effectGlow = showEffectAvailable
    ? "inset 0 0 0 1px rgba(255,221,134,0.82), 0 0 10px rgba(255,184,64,0.82), 0 0 24px rgba(255,144,32,0.5)"
    : "";
  const style = accentColor || actionable || selected || showEffectAvailable
    ? ({
        borderColor: selected ? "#e8e2cd" : showEffectAvailable ? "rgb(255 211 112 / 0.95)" : accentColor ?? "rgb(102 216 255 / 0.9)",
        boxShadow: [selectedGlow, !selected && accentColor ? `inset 0 0 0 1px ${accentColor}55` : "", !selected ? actionGlow : "", !selected ? effectGlow : ""].filter(Boolean).join(", "),
      } satisfies CSSProperties)
    : undefined;
  return (
    <article
      data-card-id={card.instanceId}
      data-audio-click={selectionDisabled ? undefined : "valid"}
      draggable={false}
      role={selectionDisabled ? undefined : "button"}
      aria-disabled={selectionDisabled ? "true" : undefined}
      onMouseEnter={() => setHoveredCardId(card.instanceId)}
      onMouseLeave={() => {
        setHoveredCardId(undefined);
        onLeave?.();
      }}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
        if (suppressContextMenu) return;
        openCardContextMenu(card.instanceId, event.clientX, event.clientY);
      }}
      onClick={() => {
        if (shouldSuppressClick?.()) return;
        if (!selectionDisabled) onSelect?.();
      }}
      style={style}
      className={[
        "group relative flex h-full w-full aspect-[488/680] min-h-28 flex-col overflow-hidden rounded-md border bg-stone-900 text-left shadow-lg shadow-black/30 transition duration-300 ease-out",
        selected && !accentColor && !actionable ? "border-[#e8e2cd]" : "border-transparent",
        card.tapped ? "rotate-2 opacity-80" : "",
        attacking ? "border-[#ff7a3d]" : "",
        compact ? "min-h-24" : "",
        actionable ? "card-actionable" : "",
        showEffectAvailable ? "card-effect-available" : "",
        autoPaid ? "card-auto-paid" : "",
        summoningSick ? "summoning-sick-card" : "",
        selectionDisabled ? "cursor-default" : "cursor-pointer",
        muted ? "opacity-75 saturate-75" : "",
      ].join(" ")}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={card.name} className="h-full w-full select-none object-cover" loading="eager" decoding="async" draggable={false} onDragStart={(event) => event.preventDefault()} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-stone-100 p-2 text-center text-xs font-bold text-stone-600">{card.displayName}</div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-stone-950/0 transition group-hover:bg-stone-950/20" />
      {summoningSick && <div className="summoning-sickness-overlay" aria-hidden="true" />}
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
    </article>
  );
}
