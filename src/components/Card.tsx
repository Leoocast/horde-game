import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { toHighResImageUrl, useCardDetails } from "../utils/cardImages";
import { cardKeywords, cardStatState } from "../utils/selectors";
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
  linkLabel?: string;
  hideStats?: boolean;
  suppressSummoningSickness?: boolean;
  suppressCardId?: boolean;
  onSelect?: () => void;
  onMana?: () => void;
  onLeave?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  suppressContextMenu?: boolean;
  shouldSuppressClick?: () => boolean;
  visualDamageMarked?: number;
  suppressHoverOverlay?: boolean;
  darkenOnHover?: boolean;
  cropTopHalf?: boolean;
  highRes?: boolean;
  dragging?: boolean;
  glowBorderWidth?: number;
};

export function Card({ game, card, selected, attacking, blocking, compact, accentColor, selectionDisabled, muted, actionable, effectAvailable, linkLabel, hideStats, suppressSummoningSickness, suppressCardId, onSelect, onMana, onLeave, onPointerDown, onContextMenu, suppressContextMenu, shouldSuppressClick, visualDamageMarked, suppressHoverOverlay, darkenOnHover = true, cropTopHalf, highRes, dragging, glowBorderWidth = 1.5 }: Props) {
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const openCardContextMenu = useGameStore((state) => state.openCardContextMenu);
  const stats = cardStatState(game, card, visualDamageMarked);
  const visibleKeywords =
    (card.zone === "battlefield" || card.zone === "hand") && card.cardTypes.includes("Creature")
      ? cardKeywords(game, card)
          .split(",")
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword !== "HASTE")
          .filter(Boolean)
      : [];
  const isZombie = card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie");
  const usesAllyKeywordStyle = card.controller !== "horde" || isZombie;
  const { imageUrl } = useCardDetails(card.definitionId);
  const displayImageUrl = highRes ? (toHighResImageUrl(imageUrl) ?? imageUrl) : imageUrl;
  const summoningSick = !suppressSummoningSickness && card.zone === "battlefield" && card.cardTypes.includes("Creature") && card.summoningSickness;
  const showEffectAvailable = Boolean(effectAvailable && !actionable);
  void onMana;
  const draggingGlow = dragging
    ? `0 0 0 ${glowBorderWidth}px rgba(255,106,0,0.9), 0 0 10px rgba(255,106,0,0.92), 0 0 22px rgba(255,106,0,0.58)`
    : "";
  const selectedGlow = selected
    ? "inset 0 0 0 1px rgba(245,241,226,0.72), 0 0 7px rgba(232,226,205,0.5), 0 0 16px rgba(164,151,126,0.28)"
    : "";
  const showCyanGlow = Boolean(actionable);
  const actionGlow = showCyanGlow
    ? "0 0 0 1.5px rgba(208,247,255,0.65), 0 0 8px rgba(49,196,255,0.8), 0 0 18px rgba(49,196,255,0.48)"
    : "";
  const effectGlow = showEffectAvailable
    ? "inset 0 0 0 1px rgba(255,221,134,0.82), 0 0 10px rgba(255,184,64,0.82), 0 0 24px rgba(255,144,32,0.5)"
    : "";
  const style = accentColor || showCyanGlow || selected || showEffectAvailable || dragging
    ? ({
        borderColor: dragging ? "#ff6a00" : selected ? "#e8e2cd" : showEffectAvailable ? "rgb(255 211 112 / 0.95)" : accentColor ?? "rgb(102 216 255 / 0.9)",
        "--glow-border-width": dragging ? `${glowBorderWidth}px` : undefined,
        boxShadow: [
          dragging ? draggingGlow : selectedGlow,
          !selected && !dragging && accentColor ? `inset 0 0 0 1px ${accentColor}55` : "",
          !selected && !dragging ? actionGlow : "",
          !selected && !dragging ? effectGlow : "",
        ]
          .filter(Boolean)
          .join(", "),
      } as CSSProperties)
    : undefined;
  return (
    <article
      data-card-id={suppressCardId ? undefined : card.instanceId}
      data-audio-click={selectionDisabled ? undefined : "valid"}
      draggable={false}
      role={selectionDisabled ? undefined : "button"}
      aria-disabled={selectionDisabled ? "true" : undefined}
      onMouseEnter={() => {
        if (!suppressHoverOverlay) setHoveredCardId(card.instanceId);
      }}
      onMouseLeave={() => {
        if (!suppressHoverOverlay) setHoveredCardId(undefined);
        onLeave?.();
      }}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => {
        if (event.shiftKey) return;
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
        "card-visual group relative flex h-full w-full aspect-[488/680] min-h-28 flex-col overflow-hidden rounded-md border bg-stone-900 text-left shadow-lg shadow-black/30 transition duration-300 ease-out",
        selected && !accentColor && !actionable ? "border-[#e8e2cd]" : "border-transparent",
        card.tapped ? "rotate-2 opacity-80" : "",
        attacking ? "border-[#ff7a3d]" : "",
        compact ? "min-h-24" : "",
        cropTopHalf ? "battlefield-land-card-crop" : "",
        actionable && !dragging ? "card-actionable" : "",
        showEffectAvailable ? "card-effect-available" : "",
        summoningSick ? "summoning-sick-card" : "",
        selectionDisabled ? "cursor-default" : "cursor-pointer",
        muted ? "opacity-75 saturate-75" : "",
      ].join(" ")}
    >
      {displayImageUrl ? (
        <img src={displayImageUrl} alt={card.name} className="h-full w-full select-none object-cover" loading="eager" decoding="async" draggable={false} onDragStart={(event) => event.preventDefault()} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-stone-100 p-2 text-center text-xs font-bold text-stone-600">{card.displayName}</div>
      )}
      {!suppressHoverOverlay && darkenOnHover && <div className="pointer-events-none absolute inset-0 bg-stone-950/0 transition group-hover:bg-stone-950/20" />}
      {summoningSick && <div className="summoning-sickness-overlay" aria-hidden="true" />}
      <div className="absolute left-1 top-1 flex flex-col items-start gap-1">
        <div className="flex flex-wrap gap-1">
          {card.tapped && <span className="rounded-sm bg-[#21130b]/85 px-1 py-0.5 text-[10px] font-bold uppercase text-[#ffe6aa]">Tapped</span>}
          {attacking && <span className="rounded-sm bg-[#7b2513]/90 px-1 py-0.5 text-[10px] font-bold uppercase text-[#ffe6aa]">Atk</span>}
          {blocking && <span className="rounded-sm bg-[#5b421f]/90 px-1 py-0.5 text-[10px] font-bold uppercase text-[#ffe6aa]">Blk</span>}
          {linkLabel && (
            <span className="rounded-sm px-1.5 py-0.5 text-[12px] font-black text-white shadow" style={{ backgroundColor: accentColor ?? "#2563eb" }}>
              {linkLabel}
            </span>
          )}
        </div>
      </div>
      {visibleKeywords.length > 0 && (
        <div className={["card-keyword-stack", isZombie ? "card-keyword-stack-zombie" : ""].join(" ")}>
          {visibleKeywords.map((keyword) => (
            <span key={keyword} className={["card-keyword-badge", usesAllyKeywordStyle ? "card-keyword-badge-ally" : "card-keyword-badge-enemy"].join(" ")}>
              {renderBattlefieldKeywordLabel(keyword)}
            </span>
          ))}
        </div>
      )}
      {!hideStats && stats.text && (
        <span
          className={[
            "card-stat-badge absolute flex items-center justify-center rounded-[999px] border font-black leading-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),inset_0_-1px_1px_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.55)]",
            stats.damaged
              ? "border-[#4b0f0a] bg-gradient-to-b from-[#f3a59b] via-[#b93327] to-[#6d150f] text-[#fff0e8]"
              : stats.buffed
                ? "border-[#275d21] bg-gradient-to-b from-[#edffe6] via-[#a7d694] to-[#5c8750] text-[#123910]"
                : "border-[#485356] bg-gradient-to-b from-[#edf4ed] via-[#b9c5bf] to-[#7f8b87] text-[#18201f]",
          ].join(" ")}
        >
          {stats.text}
        </span>
      )}
    </article>
  );
}

function renderBattlefieldKeywordLabel(keyword: string) {
  const toxic = keyword.match(/^TOXIC\s+\{(\d+)\}$/i);
  if (!toxic) return keyword;
  return (
    <>
      TOXIC <span className="card-toxic-counter">{toxic[1]}</span>
    </>
  );
}
