import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { toHighResImageUrl, useCardDetails } from "../utils/cardImages";
import { cardKeywords, cardStatState } from "../utils/selectors";
import { useGameStore } from "../store/useGameStore";
import { Heart, Swords } from "lucide-react";

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
  sharpImageOverlay?: boolean;
  dragging?: boolean;
  glowBorderWidth?: number;
};

export function Card({ game, card, selected, attacking, blocking, compact, accentColor, selectionDisabled, muted, actionable, effectAvailable, linkLabel, hideStats, suppressSummoningSickness, suppressCardId, onSelect, onMana, onLeave, onPointerDown, onContextMenu, suppressContextMenu, shouldSuppressClick, visualDamageMarked, suppressHoverOverlay, darkenOnHover = true, cropTopHalf, highRes, sharpImageOverlay, dragging, glowBorderWidth = 1.5 }: Props) {
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
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
  const highResImageUrl = toHighResImageUrl(imageUrl) ?? imageUrl;
  const displayImageUrl = highRes ? highResImageUrl : imageUrl;
  const summoningSick = !suppressSummoningSickness && card.zone === "battlefield" && card.cardTypes.includes("Creature") && card.summoningSickness;
  const showEffectAvailable = Boolean(effectAvailable && !actionable);
  void onMana;
  const draggingGlow = dragging
    ? `0 0 0 ${glowBorderWidth}px rgba(255,106,0,0.9), 0 0 10px rgba(255,106,0,0.92), 0 0 22px rgba(255,106,0,0.58)`
    : "";
  const showSelectedVisual = Boolean(selected && card.zone !== "battlefield");
  const selectedGlow = showSelectedVisual
    ? "inset 0 0 0 1px rgba(245,241,226,0.72), 0 0 7px rgba(232,226,205,0.5), 0 0 16px rgba(164,151,126,0.28)"
    : "";
  const showActionGlow = Boolean(actionable);
  const actionGlow = showActionGlow
    ? "inset 0 0 0 1px rgba(228,218,158,0.42), 0 0 8px rgba(103,166,137,0.62), 0 0 18px rgba(44,111,99,0.4)"
    : "";
  const effectGlow = showEffectAvailable
    ? "inset 0 0 0 1px rgba(255,221,134,0.82), 0 0 10px rgba(255,184,64,0.82), 0 0 24px rgba(255,144,32,0.5)"
    : "";
  const style = accentColor || showActionGlow || showSelectedVisual || showEffectAvailable || dragging
    ? ({
        borderColor: dragging ? "#ff6a00" : showSelectedVisual ? "#e8e2cd" : showEffectAvailable ? "rgb(255 211 112 / 0.95)" : accentColor ?? "rgb(190 183 111 / 0.88)",
        "--glow-border-width": dragging ? `${glowBorderWidth}px` : undefined,
        boxShadow: [
          dragging ? draggingGlow : selectedGlow,
          !showSelectedVisual && !dragging && accentColor ? `inset 0 0 0 1px ${accentColor}55` : "",
          !showSelectedVisual && !dragging ? actionGlow : "",
          !showSelectedVisual && !dragging ? effectGlow : "",
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
        setHoveredCardId(undefined);
        setFocusedCardId(card.instanceId);
      }}
      onClick={() => {
        if (shouldSuppressClick?.()) return;
        setHoveredCardId(undefined);
        if (!selectionDisabled) onSelect?.();
      }}
      style={style}
      className={[
        "card-visual group relative flex h-full w-full aspect-[488/680] min-h-28 flex-col overflow-hidden rounded-md border bg-stone-900 text-left shadow-lg shadow-black/30 transition duration-300 ease-out",
        showSelectedVisual && !accentColor && !actionable ? "border-[#e8e2cd]" : "border-transparent",
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
      {sharpImageOverlay && highResImageUrl && (
        <div className="card-sharp-image-overlay" aria-hidden="true">
          <img src={highResImageUrl} alt="" loading="eager" decoding="async" draggable={false} />
        </div>
      )}
      {actionable && !dragging && (
        <span className="card-actionable-sweep" aria-hidden="true" />
      )}
      {showEffectAvailable && (
        <span className="card-actionable-sweep card-effect-available-sweep" aria-hidden="true" />
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
            <span key={keyword} className={["card-keyword-badge", keyword === "DEATHTOUCH" ? "card-keyword-deathtouch" : "", usesAllyKeywordStyle ? "card-keyword-badge-ally" : "card-keyword-badge-enemy"].join(" ")}>
              {renderBattlefieldKeywordLabel(keyword)}
            </span>
          ))}
        </div>
      )}
      {!hideStats && stats.text && (
        <div
          aria-label={`${stats.power} attack, ${stats.toughness} life`}
          className={[
            "card-stat-badge",
            stats.damaged ? "is-damaged" : "",
            stats.buffed ? "is-buffed" : "",
          ].join(" ")}
        >
          <span className="card-stat-segment card-stat-attack"><Swords aria-hidden="true" /><b>{stats.power}</b></span>
          <i aria-hidden="true" />
          <span className="card-stat-segment card-stat-life"><Heart aria-hidden="true" /><b>{stats.toughness}</b></span>
        </div>
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
