import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { localizedCardName, localizedTraitLabel, naturalCaseTraitLabel } from "../i18n/cardLocalization";
import { STATE_VOCABULARY, vocabularyText } from "../i18n/gameVocabulary";
import { useTranslation } from "../i18n/useTranslation";
import { cardThemeForDefinition, useCardDetails, usesFullArtCardImage } from "../utils/cardImages";
import { cardTraits, cardStatState } from "../utils/selectors";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { Heart, Shield, Sword, Swords } from "lucide-react";

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
  suppressActionableChrome?: boolean;
  effectAvailable?: boolean;
  linkLabel?: string;
  hideStats?: boolean;
  suppressStabilizing?: boolean;
  suppressCardId?: boolean;
  onSelect?: () => void;
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
  showFullImage?: boolean;
  showCostBadge?: boolean;
  showCroppedTitle?: boolean;
  clipActionSweep?: boolean;
  preferNativeImageRendering?: boolean;
  face?: ReactNode;
  dragging?: boolean;
  glowBorderWidth?: number;
};

export function Card({ game, card, selected, attacking, blocking, compact, accentColor, selectionDisabled, muted, actionable, suppressActionableChrome = false, effectAvailable, linkLabel, hideStats, suppressStabilizing, suppressCardId, onSelect, onLeave, onPointerDown, onContextMenu, suppressContextMenu, shouldSuppressClick, visualDamageMarked, suppressHoverOverlay, darkenOnHover = true, cropTopHalf, highRes, sharpImageOverlay, showFullImage = false, showCostBadge = false, showCroppedTitle = false, clipActionSweep = false, preferNativeImageRendering = false, face, dragging, glowBorderWidth = 1.5 }: Props) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const heldStaticAuraBonus = useGameStore((state) => state.heldStaticAuraBonuses[card.instanceId]);
  const stats = cardStatState(game, card, visualDamageMarked, heldStaticAuraBonus);
  const visibleTraits =
    (card.zone === "field" || card.zone === "hand") && card.kinds.includes("ECHO")
      ? cardTraits(game, card)
          .split(",")
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword !== "IMPETUS")
          .filter(Boolean)
      : [];
  const isZombie = card.subtypes.some((subtype) => subtype.toLowerCase() === "zombie");
  const deckTheme = cardThemeForDefinition(card.definitionId);
  const cardTheme = deckTheme === "ramp" ? undefined : deckTheme;
  // Host creatures Exhaust as a rule of the mode, not as a choice the player made, so they never
  // get the grey "spent" treatment or the Exhausted badge. They DO lean as soon as they
  // are declared as attackers — a turn that only arrives once combat is over reads as a glitch.
  const usesHostExhaustedStyle = card.controller === "host" && card.kinds.includes("ECHO");
  const keywordToneClass = cardTheme
    ? `card-keyword-badge-${cardTheme}`
    : card.controller === "host"
      ? "card-keyword-badge-enemy"
      : "card-keyword-badge-ally";
  const { imageUrl } = useCardDetails(card.definitionId);
  const localizedName = localizedCardName(card, language);
  const highResImageUrl = imageUrl;
  const displayImageUrl = highRes ? highResImageUrl : imageUrl;
  const stabilizing = !suppressStabilizing && card.zone === "field" && card.kinds.includes("ECHO") && card.stabilizing;
  const showEffectAvailable = Boolean(effectAvailable && !actionable);
  const draggingGlow = dragging
    ? `0 0 0 ${glowBorderWidth}px rgba(255,106,0,0.9), 0 0 10px rgba(255,106,0,0.92), 0 0 22px rgba(255,106,0,0.58)`
    : "";
  const showSelectedVisual = Boolean(selected && card.zone !== "field");
  const selectedGlow = showSelectedVisual
    ? "inset 0 0 0 1px rgba(245,241,226,0.72), 0 0 7px rgba(232,226,205,0.5), 0 0 16px rgba(164,151,126,0.28)"
    : "";
  const showActionGlow = Boolean(actionable && !suppressActionableChrome);
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
      aria-label={[
        localizedName,
        card.exhausted && !usesHostExhaustedStyle ? t("card.exhausted") : "",
        stabilizing ? vocabularyText(STATE_VOCABULARY.STABILIZING, language) : "",
      ].filter(Boolean).join(", ")}
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
        "card-visual group relative flex h-full w-full aspect-[488/680] min-h-28 flex-col text-left transition duration-300 ease-out",
        showFullImage
          ? "overflow-visible rounded-none border-0 bg-transparent shadow-none"
          : "overflow-hidden rounded-md border bg-stone-900 shadow-lg shadow-black/30",
        showSelectedVisual && !accentColor && !actionable ? "border-[#e8e2cd]" : "border-transparent",
        card.exhausted || (attacking && usesHostExhaustedStyle) ? "card-tapped" : "",
        (card.exhausted || attacking) && usesHostExhaustedStyle ? "card-tapped-zombie" : "",
        attacking ? "border-[#ff7a3d]" : "",
        compact ? "min-h-24" : "",
        cropTopHalf ? "battlefield-land-card-crop" : "",
        showFullImage ? "card-image-full" : "",
        preferNativeImageRendering ? "card-image-native-hd" : "",
        cardTheme ? `card-theme-${cardTheme}` : "",
        usesFullArtCardImage(card.definitionId) ? "card-layout-full-art" : "",
        stats.buffed ? "card-stats-buffed" : "",
        stats.damaged ? "card-stats-damaged" : "",
        actionable && !dragging ? "card-actionable" : "",
        showEffectAvailable ? "card-effect-available" : "",
        stabilizing ? "summoning-sick-card" : "",
        selectionDisabled ? "cursor-default" : "cursor-pointer",
        muted ? "opacity-75 saturate-75" : "",
      ].join(" ")}
    >
      {face ?? (displayImageUrl ? (
        <img src={displayImageUrl} alt={localizedName} className="h-full w-full select-none object-cover" loading="eager" decoding="async" draggable={false} onDragStart={(event) => event.preventDefault()} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-stone-100 p-2 text-center text-xs font-bold text-stone-600">{localizedName}</div>
      ))}
      {!face && sharpImageOverlay && highResImageUrl && (
        <div className="card-sharp-image-overlay" aria-hidden="true">
          <img src={highResImageUrl} alt="" loading="eager" decoding="async" draggable={false} />
        </div>
      )}
      {showCroppedTitle && (
        <div className="card-cropped-title" aria-hidden="true" title={localizedName}>
          <span>{localizedName}</span>
        </div>
      )}
      {showCostBadge && <CardCostBadge card={card} />}
      {showActionGlow && !dragging && (
        clipActionSweep ? (
          <span className="card-actionable-sweep-clip" aria-hidden="true">
            <span className="card-actionable-sweep" />
          </span>
        ) : (
          <span className="card-actionable-sweep" aria-hidden="true" />
        )
      )}
      {showEffectAvailable && (
        clipActionSweep ? (
          <span className="card-actionable-sweep-clip" aria-hidden="true">
            <span className="card-actionable-sweep card-effect-available-sweep" />
          </span>
        ) : (
          <span className="card-actionable-sweep card-effect-available-sweep" aria-hidden="true" />
        )
      )}
      {!suppressHoverOverlay && darkenOnHover && <div className="pointer-events-none absolute inset-0 bg-stone-950/0 transition group-hover:bg-stone-950/20" />}
      {stabilizing && <div className="summoning-sickness-overlay" aria-hidden="true" />}
      <div className="absolute left-1 top-1 flex flex-col items-start gap-1">
        <div className="flex flex-wrap gap-1">
          {card.exhausted && !usesHostExhaustedStyle && <span className="rounded-sm bg-[#21130b]/85 px-1 py-0.5 text-[10px] font-bold uppercase text-[#ffe6aa]">{t("card.exhausted")}</span>}
          {attacking && !(card.controller === "host" && linkLabel) && <span className="card-state-tag card-state-tag-attack">{t("card.attacking")}</span>}
          {blocking && linkLabel ? null : blocking ? (
            <span className="card-state-tag card-state-tag-block">{t("card.blocking")}</span>
          ) : null}
        </div>
      </div>
      {visibleTraits.length > 0 && (
        <div className={["card-keyword-stack", isZombie ? "card-keyword-stack-zombie" : ""].join(" ")}>
          {visibleTraits.map((keyword) => (
            <span key={keyword} className={["card-keyword-badge", keyword === "LETHAL" ? "card-keyword-deathtouch" : "", game.gameMode === "chaos" ? "card-keyword-chaos" : "", keywordToneClass].join(" ")}>
              {renderBattlefieldTraitLabel(naturalCaseTraitLabel(localizedTraitLabel(keyword, language)))}
            </span>
          ))}
        </div>
      )}
      {!hideStats && (
        <CardStatsBadge
          stats={stats}
          preferSingleSword={preferNativeImageRendering || showFullImage}
        />
      )}
    </article>
  );
}

export function CardDefenseBadge({
  count,
  variant,
}: {
  count: string;
  variant: "host" | "player";
}) {
  const t = useTranslation();
  const label = variant === "host"
    ? t("card.blockersAssigned", { count })
    : t("card.blockingOrder", { count });

  return (
    <span className="card-defense-badge-anchor">
      <span className={`card-defense-badge card-defense-badge-${variant}`} aria-label={label}>
        <Shield aria-hidden="true" />
        <strong>{count}</strong>
      </span>
    </span>
  );
}

export type CardStatDisplay = ReturnType<typeof cardStatState>;

export function CardCostBadge({
  card,
}: {
  card: { energyCost?: number; variableCost?: { hasX?: boolean } };
}) {
  const printedCost = Math.max(0, Number(card.energyCost) || 0);
  const label = card.variableCost?.hasX ? "X" : printedCost;
  if (label === 0) return null;

  return (
    <div className="card-cost-badge" aria-hidden="true">
      <span className="card-cost-energy-orb">
        <span className="card-cost-energy-liquid" />
      </span>
      <span className="card-cost-value">{label}</span>
    </div>
  );
}

export function CardStatsBadge({
  stats,
  preferSingleSword = false,
}: {
  stats: CardStatDisplay;
  preferSingleSword?: boolean;
}) {
  const language = useLanguageStore((state) => state.language);
  if (!stats.text) return null;

  return (
    <div
      aria-label={language === "es" ? `${stats.power} de Fuerza, ${stats.endurance} de Aguante` : `${stats.power} Power, ${stats.endurance} Endurance`}
      className={[
        "card-stat-badge",
        stats.damaged ? "is-damaged" : "",
        stats.buffed ? "is-buffed" : "",
      ].join(" ")}
    >
      <span className="card-stat-motif" aria-hidden="true" />
      <span className="card-stat-segment card-stat-attack">
        {preferSingleSword ? <Sword aria-hidden="true" /> : <Swords aria-hidden="true" />}
        <b>{stats.power}</b>
      </span>
      <i aria-hidden="true" />
      <span className="card-stat-segment card-stat-life"><Heart aria-hidden="true" /><b>{stats.endurance}</b></span>
    </div>
  );
}

function renderBattlefieldTraitLabel(keyword: string) {
  const poison = keyword.match(/^(POISON|VENENO)\s+\{?(\d+)\}?$/i);
  if (!poison) return keyword;
  return (
    <>
      {poison[1]} <span className="card-toxic-counter">{poison[2]}</span>
    </>
  );
}
