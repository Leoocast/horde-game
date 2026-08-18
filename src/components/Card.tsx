import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, Ref } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { localizedCardName, localizedTraitLabel, localizedTraitTooltip, naturalCaseTraitLabel } from "../i18n/cardLocalization";
import { STATE_VOCABULARY, vocabularyText } from "../i18n/gameVocabulary";
import { useTranslation } from "../i18n/useTranslation";
import { cardThemeForDefinition, useCardDetails, usesFullArtCardImage } from "../utils/cardImages";
import {
  battlefieldArtCssVariables,
  battlefieldArtSourceCssVariables,
} from "../utils/battlefieldArtFrame";
import { cardStatFrameCssVariables } from "../utils/cardStatFrame";
import { cardTraits, cardStatState } from "../utils/selectors";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { Heart, Shield, Sword, Swords, Zap } from "lucide-react";
import { CardTraitIcon } from "./CardTraitIcon";
import { GameTooltip } from "./GameTooltip";

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
  onKeyboardActivate?: () => void;
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
  emphasizeCost?: boolean;
  showCroppedTitle?: boolean;
  clipActionSweep?: boolean;
  preferNativeImageRendering?: boolean;
  useBattlefieldArt?: boolean;
  face?: ReactNode;
  dragging?: boolean;
  glowBorderWidth?: number;
};

export function Card({ game, card, selected, attacking, blocking, compact, accentColor, selectionDisabled, muted, actionable, suppressActionableChrome = false, effectAvailable, linkLabel, hideStats, suppressStabilizing, suppressCardId, onSelect, onKeyboardActivate, onLeave, onPointerDown, onContextMenu, suppressContextMenu, shouldSuppressClick, visualDamageMarked, suppressHoverOverlay, darkenOnHover = true, cropTopHalf, highRes, sharpImageOverlay, showFullImage = false, showCostBadge = false, emphasizeCost = false, showCroppedTitle = false, clipActionSweep = false, preferNativeImageRendering = false, useBattlefieldArt = false, face, dragging, glowBorderWidth = 1.5 }: Props) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const heldStaticAuraBonus = useGameStore((state) => state.heldStaticAuraBonuses[card.instanceId]);
  const stats = cardStatState(game, card, visualDamageMarked, heldStaticAuraBonus);
  const visibleTraits = visibleCardTraits(game, card);
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
  const { imageUrl, battlefieldArtUrl, battlefieldArtFrame, statsFrame } = useCardDetails(card.definitionId);
  const localizedName = localizedCardName(card, language);
  const highResImageUrl = imageUrl;
  const requestedBattlefieldArtUrl = useBattlefieldArt ? battlefieldArtUrl : undefined;
  const primaryImageUrl = requestedBattlefieldArtUrl
    ? requestedBattlefieldArtUrl
    : highRes
      ? highResImageUrl
      : imageUrl;
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const displayImageUrl = primaryImageUrl && !failedImageUrls.includes(primaryImageUrl)
    ? primaryImageUrl
    : requestedBattlefieldArtUrl && imageUrl && !failedImageUrls.includes(imageUrl)
      ? imageUrl
      : undefined;
  const usingBattlefieldArt = Boolean(
    requestedBattlefieldArtUrl && displayImageUrl === requestedBattlefieldArtUrl,
  );
  const battlefieldArtImageRef = useRef<HTMLImageElement>(null);
  const [battlefieldArtSourceStyle, setBattlefieldArtSourceStyle] = useState<Record<string, string>>();
  const syncBattlefieldArtSourceStyle = useCallback((image: HTMLImageElement) => {
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    setBattlefieldArtSourceStyle(
      battlefieldArtSourceCssVariables(image.naturalWidth, image.naturalHeight),
    );
  }, []);
  useLayoutEffect(() => {
    if (!usingBattlefieldArt) {
      setBattlefieldArtSourceStyle(undefined);
      return;
    }

    const image = battlefieldArtImageRef.current;
    if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      syncBattlefieldArtSourceStyle(image);
    } else {
      setBattlefieldArtSourceStyle(undefined);
    }
  }, [displayImageUrl, syncBattlefieldArtSourceStyle, usingBattlefieldArt]);
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
  const interactionStyle = accentColor || showActionGlow || showSelectedVisual || showEffectAvailable || dragging
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
  const style = interactionStyle || useBattlefieldArt || statsFrame
    ? ({
        ...interactionStyle,
        ...(useBattlefieldArt ? battlefieldArtCssVariables(battlefieldArtFrame) : {}),
        ...(usingBattlefieldArt ? battlefieldArtSourceStyle : {}),
        ...cardStatFrameCssVariables(statsFrame),
      } as CSSProperties)
    : undefined;
  return (
    <article
      data-card-id={suppressCardId ? undefined : card.instanceId}
      data-audio-click={selectionDisabled ? undefined : "valid"}
      draggable={false}
      role={selectionDisabled ? undefined : "button"}
      tabIndex={selectionDisabled ? undefined : 0}
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
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (selectionDisabled || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        if (shouldSuppressClick?.()) return;
        setHoveredCardId(undefined);
        (onKeyboardActivate ?? onSelect)?.();
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
        preferNativeImageRendering || useBattlefieldArt ? "card-image-native-hd" : "",
        useBattlefieldArt ? "card-battlefield-cropped" : "",
        useBattlefieldArt && !usingBattlefieldArt ? "card-battlefield-art-fallback" : "",
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
        <img
          key={displayImageUrl}
          ref={usingBattlefieldArt ? battlefieldArtImageRef : undefined}
          src={displayImageUrl}
          alt={localizedName}
          className="h-full w-full select-none object-cover"
          loading="eager"
          decoding="async"
          draggable={false}
          style={usingBattlefieldArt && !battlefieldArtSourceStyle ? { visibility: "hidden" } : undefined}
          onLoad={usingBattlefieldArt
            ? (event) => syncBattlefieldArtSourceStyle(event.currentTarget)
            : undefined}
          onError={(event) => {
            // Public assets can move while Vite hot-reloads a deck migration. Hide Chromium's
            // broken-image placeholder immediately, then retry with the printed card (when the
            // battlefield crop failed) or use the normal text fallback.
            event.currentTarget.style.visibility = "hidden";
            const failedUrl = displayImageUrl;
            if (failedUrl) {
              setFailedImageUrls((current) => current.includes(failedUrl)
                ? current
                : [...current, failedUrl]);
            }
          }}
          onDragStart={(event) => event.preventDefault()}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-stone-100 p-2 text-center text-xs font-bold text-stone-600">{localizedName}</div>
      ))}
      {!face && sharpImageOverlay && highResImageUrl && !failedImageUrls.includes(highResImageUrl) && (
        <div className="card-sharp-image-overlay" aria-hidden="true">
          <img
            src={highResImageUrl}
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
              const failedUrl = highResImageUrl;
              setFailedImageUrls((current) => current.includes(failedUrl)
                ? current
                : [...current, failedUrl]);
            }}
          />
        </div>
      )}
      {showCroppedTitle && (
        <div className="card-cropped-title" aria-hidden="true" title={localizedName}>
          <span>{localizedName}</span>
        </div>
      )}
      {showCostBadge && <CardCostBadge card={card} emphasized={emphasizeCost} />}
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
      {visibleTraits.length > 0 && !showCroppedTitle && (
        <div className={["card-keyword-stack", isZombie ? "card-keyword-stack-zombie" : ""].join(" ")}>
          {visibleTraits.map((keyword) => (
            <span key={keyword} className={["card-keyword-badge", keyword === "LETHAL" ? "card-keyword-deathtouch" : "", game.gameMode === "chaos" ? "card-keyword-chaos" : "", keywordToneClass].join(" ")}>
              <CardTraitIcon keyword={keyword} />
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

export function CardTraitIconBadges({
  game,
  card,
  variant,
}: {
  game: GameState;
  card: CardInstance;
  variant: "host" | "player";
}) {
  const language = useLanguageStore((state) => state.language);
  const visibleTraits = visibleCardTraits(game, card);
  if (visibleTraits.length === 0) return null;

  const deckTheme = cardThemeForDefinition(card.definitionId);
  const cardTheme = deckTheme === "ramp" ? undefined : deckTheme;
  const keywordToneClass = cardTheme
    ? `card-keyword-badge-${cardTheme}`
    : card.controller === "host"
      ? "card-keyword-badge-enemy"
      : "card-keyword-badge-ally";

  return (
    <span className="card-trait-icon-badges-anchor">
      <span className={`card-trait-icon-badges card-trait-icon-badges-${variant}`}>
        {visibleTraits.map((keyword) => {
          const label = naturalCaseTraitLabel(localizedTraitLabel(keyword, language));
          const reminder = localizedTraitTooltip(keyword, language);

          return (
            <GameTooltip
              key={keyword}
              className="card-trait-icon-tooltip-host"
              side={variant === "host" ? "bottom" : "top"}
              content={(
                <span className="card-trait-icon-tooltip-copy">
                  <CardTraitTooltipBadge
                    keyword={keyword}
                    label={label}
                    toneClass={keywordToneClass}
                    chaos={game.gameMode === "chaos"}
                  />
                  <span>{reminder}</span>
                </span>
              )}
            >
              <span
                aria-label={`${label}: ${reminder}`}
                className={[
                  "card-keyword-badge",
                  "card-trait-icon-badge",
                  game.gameMode === "chaos" ? "card-keyword-chaos" : "",
                  keywordToneClass,
                ].join(" ")}
              >
                <CardTraitIcon keyword={keyword} showAmount />
              </span>
            </GameTooltip>
          );
        })}
      </span>
    </span>
  );
}

export function CardTraitTooltipBadge({
  keyword,
  label,
  toneClass,
  chaos = false,
}: {
  keyword: string;
  label: string;
  toneClass: string;
  chaos?: boolean;
}) {
  return (
    <strong
      className={[
        "card-keyword-badge",
        "card-trait-tooltip-keyword",
        keyword === "LETHAL" ? "card-keyword-deathtouch" : "",
        chaos ? "card-keyword-chaos" : "",
        toneClass,
      ].join(" ")}
    >
      <CardTraitIcon keyword={keyword} />
      {label}
    </strong>
  );
}

export type CardStatDisplay = ReturnType<typeof cardStatState>;

export function CardCostBadge({
  card,
  emphasized = false,
}: {
  card: { energyCost?: number; variableCost?: { hasX?: boolean } };
  emphasized?: boolean;
}) {
  const printedCost = Math.max(0, Number(card.energyCost) || 0);
  const label = card.variableCost?.hasX ? "X" : printedCost;
  if (label === 0) return null;

  return (
    <div className={`card-cost-badge${emphasized ? " is-guided-emphasis" : ""}`} aria-hidden="true">
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
  ref,
}: {
  stats: CardStatDisplay;
  preferSingleSword?: boolean;
  ref?: Ref<HTMLDivElement>;
}) {
  const language = useLanguageStore((state) => state.language);
  if (!stats.text) return null;

  return (
    <div
      ref={ref}
      aria-label={language === "es" ? `${stats.power} de Fuerza, ${stats.endurance} de Aguante` : `${stats.power} Power, ${stats.endurance} Endurance`}
      className={[
        "card-stat-badge",
        stats.damaged ? "is-damaged" : "",
        stats.buffed ? "is-buffed" : "",
        stats.debuffed ? "is-debuffed" : "",
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

function visibleCardTraits(game: GameState, card: CardInstance): string[] {
  if ((card.zone !== "field" && card.zone !== "hand") || !card.kinds.includes("ECHO")) return [];
  return cardTraits(game, card)
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword !== "IMPETUS")
    .filter(Boolean);
}
