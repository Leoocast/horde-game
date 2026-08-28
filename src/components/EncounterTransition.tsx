import { Shield, Skull, Swords } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { findDeckKeyCard, findInspectableDeck, type InspectableDeck } from "../data/deckCatalog";
import type { GameMode } from "../engine/GameTypes";
import { localizedDeckName } from "../i18n/deckLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";
import { useDeckCardDetails } from "../utils/deckCardImages";

export type EncounterCardRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type EncounterCardOrigins = Readonly<{
  player: EncounterCardRect;
  host: EncounterCardRect;
}>;

type Props = {
  chronicleDeckId: string;
  hostDeckId: string;
  gameMode: GameMode;
  /** Preparation captures these before it yields the screen, so its visible cards can keep moving. */
  cardOrigins?: EncounterCardOrigins;
};

type ContinuityCardStyle = CSSProperties & Record<`--encounter-${string}`, string>;

/** Shared with App so the board begins revealing under the CSS clash beat. */
export const ENCOUNTER_IMPACT_MS = 1050;
export const ENCOUNTER_TRANSITION_MS = 2450;
/**
 * Instante en que las cortinas dejan de estar cerradas y empieza el corte diagonal: es el
 * 68 % de `encounter-curtain-player` / `encounter-curtain-host`. La obertura del tablero se
 * engancha aquí, así que mover ese keyframe obliga a mover esta constante con él.
 */
export const ENCOUNTER_OPEN_MS = Math.round(ENCOUNTER_TRANSITION_MS * 0.68);

export function EncounterTransition({ chronicleDeckId, hostDeckId, gameMode, cardOrigins }: Props) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const chronicleDeck = findInspectableDeck(chronicleDeckId);
  const hostDeck = findInspectableDeck(hostDeckId);
  const chronicleDetails = useDeckCardDetails(findDeckKeyCard(chronicleDeck), chronicleDeck.images, language);
  const hostDetails = useDeckCardDetails(findDeckKeyCard(hostDeck), hostDeck.images, language);
  const playerTargetRef = useRef<HTMLDivElement>(null);
  const hostTargetRef = useRef<HTMLDivElement>(null);
  const [cardTargets, setCardTargets] = useState<EncounterCardOrigins | null>(null);
  const [continuityUnavailable, setContinuityUnavailable] = useState(false);
  const tone = gameMode === "chaos" ? "chaos" : hostDeck.presentation.encounterTone ?? "undead";
  const hasContinuityCandidate = Boolean(cardOrigins && chronicleDetails.imageUrl && hostDetails.imageUrl);
  const measuringContinuity = hasContinuityCandidate && !cardTargets && !continuityUnavailable;
  const continuingCards = Boolean(cardOrigins && cardTargets && !continuityUnavailable);

  /* The target cards participate in the real matchup layout. One pre-paint pass freezes their
     final, unrotated boxes; the visible copies can then travel from Preparation without a remount. */
  useLayoutEffect(() => {
    if (!measuringContinuity) return;
    const player = readEncounterCardRect(playerTargetRef.current);
    const host = readEncounterCardRect(hostTargetRef.current);
    if (!player || !host) {
      setContinuityUnavailable(true);
      return;
    }
    setCardTargets({ player, host });
  }, [measuringContinuity]);

  return (
    <div
      className={`encounter-transition is-${tone}${measuringContinuity ? " is-continuity-measuring" : ""}${continuingCards ? " has-card-continuity" : ""}`}
      role="status"
      aria-live="polite"
      data-audio-click="off"
    >
      <div className="encounter-transition-vignette" />
      {continuingCards && cardOrigins && cardTargets && chronicleDetails.imageUrl && hostDetails.imageUrl && (
        <>
          <ContinuityCard
            side="player"
            deck={chronicleDeck}
            imageUrl={chronicleDetails.imageUrl}
            origin={cardOrigins.player}
            target={cardTargets.player}
          />
          <ContinuityCard
            side="host"
            deck={hostDeck}
            imageUrl={hostDetails.imageUrl}
            origin={cardOrigins.host}
            target={cardTargets.host}
          />
        </>
      )}
      <div className="encounter-transition-content">
        <p>{gameMode === "chaos" ? t("encounter.chaos") : t("encounter.standard")}</p>
        <div className="encounter-transition-matchup">
          <div className="encounter-transition-combatant encounter-transition-combatant-player">
            <div className={`encounter-transition-side encounter-transition-side-player deck-theme-${chronicleDeck.presentation.theme}`}>
              <span className="encounter-transition-eyebrow"><Shield size={12} />{t(gameMode === "chaos" ? "setup.playerSide" : "setup.chronicleSide")}</span>
              <strong className="encounter-transition-name encounter-transition-name-player">{localizedDeckName(chronicleDeck.deck, language)}</strong>
            </div>
            <EncounterArt deck={chronicleDeck} side="player" imageUrl={chronicleDetails.imageUrl} artRef={playerTargetRef} />
          </div>
          <span className="encounter-transition-versus">
            <span className="encounter-transition-versus-mark" aria-hidden="true">
              <span className="encounter-transition-rift" />
              <span className="encounter-transition-impact" />
              <Swords size={34} />
            </span>
            <b>VS</b>
          </span>
          <div className="encounter-transition-combatant encounter-transition-combatant-host">
            <EncounterArt deck={hostDeck} side="host" imageUrl={hostDetails.imageUrl} artRef={hostTargetRef} />
            <div className={`encounter-transition-side encounter-transition-side-host deck-theme-${hostDeck.presentation.theme}`}>
              <span className="encounter-transition-eyebrow"><Skull size={12} />{t("setup.hostSide")}</span>
              <strong className="encounter-transition-name encounter-transition-name-host">{localizedDeckName(hostDeck.deck, language)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The deck's key card holds the target slot even when a continuity copy is painting above it. */
function EncounterArt({ deck, side, imageUrl, artRef }: {
  deck: InspectableDeck;
  side: "player" | "host";
  imageUrl?: string;
  artRef: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={artRef} className={`encounter-transition-art encounter-transition-art-${side} deck-theme-${deck.presentation.theme}`} aria-hidden="true">
      {imageUrl && <img src={imageUrl} alt="" draggable={false} />}
    </div>
  );
}

function ContinuityCard({ deck, side, imageUrl, origin, target }: {
  deck: InspectableDeck;
  side: "player" | "host";
  imageUrl: string;
  origin: EncounterCardRect;
  target: EncounterCardRect;
}) {
  return (
    <div
      className={`encounter-transition-continuity-card is-${side} deck-theme-${deck.presentation.theme}`}
      style={continuityCardStyle(origin, target)}
      aria-hidden="true"
    >
      <img src={imageUrl} alt="" draggable={false} />
    </div>
  );
}

function readEncounterCardRect(card: HTMLElement | null): EncounterCardRect | undefined {
  if (!card) return undefined;
  const rect = card.getBoundingClientRect();
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function continuityCardStyle(origin: EncounterCardRect, target: EncounterCardRect): ContinuityCardStyle {
  return {
    "--encounter-origin-left": `${origin.left}px`,
    "--encounter-origin-top": `${origin.top}px`,
    "--encounter-origin-width": `${origin.width}px`,
    "--encounter-origin-height": `${origin.height}px`,
    "--encounter-target-left": `${target.left}px`,
    "--encounter-target-top": `${target.top}px`,
    "--encounter-target-width": `${target.width}px`,
    "--encounter-target-height": `${target.height}px`,
  };
}
