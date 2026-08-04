import { Shield, Skull, Swords } from "lucide-react";
import { findDeckKeyCard, findInspectableDeck, type InspectableDeck } from "../data/deckCatalog";
import type { GameMode } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { useDeckCardDetails } from "../utils/deckCardImages";

type Props = {
  chronicleDeckId: string;
  hostDeckId: string;
  gameMode: GameMode;
};

/** Shared with App so the board begins revealing under the CSS clash beat. */
export const ENCOUNTER_IMPACT_MS = 1050;
export const ENCOUNTER_TRANSITION_MS = 2450;

export function EncounterTransition({ chronicleDeckId, hostDeckId, gameMode }: Props) {
  const t = useTranslation();
  const chronicleDeck = findInspectableDeck(chronicleDeckId);
  const hostDeck = findInspectableDeck(hostDeckId);
  const tone = gameMode === "chaos" ? "chaos" : hostDeck.presentation.encounterTone ?? "undead";

  return (
    <div className={`encounter-transition is-${tone}`} role="status" aria-live="polite" data-audio-click="off">
      <div className="encounter-transition-vignette" />
      <div className="encounter-transition-content">
        <p>{gameMode === "chaos" ? t("encounter.chaos") : t("encounter.standard")}</p>
        <div className="encounter-transition-matchup">
          <div className="encounter-transition-combatant encounter-transition-combatant-player">
            <div className={`encounter-transition-side encounter-transition-side-player deck-theme-${chronicleDeck.presentation.theme}`}>
              <span className="encounter-transition-eyebrow"><Shield size={12} />{t("setup.playerSide")}</span>
              <strong className="encounter-transition-name encounter-transition-name-player">{chronicleDeck.deck.name}</strong>
            </div>
            <EncounterArt deck={chronicleDeck} side="player" />
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
            <EncounterArt deck={hostDeck} side="host" />
            <div className={`encounter-transition-side encounter-transition-side-host deck-theme-${hostDeck.presentation.theme}`}>
              <span className="encounter-transition-eyebrow"><Skull size={12} />{t("setup.hostSide")}</span>
              <strong className="encounter-transition-name encounter-transition-name-host">{hostDeck.deck.name}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The deck's key card collides at the center while remaining attached to its own name. */
function EncounterArt({ deck, side }: { deck: InspectableDeck; side: "player" | "host" }) {
  const details = useDeckCardDetails(findDeckKeyCard(deck), deck.images);
  if (!details.imageUrl) return null;
  return (
    <div className={`encounter-transition-art encounter-transition-art-${side} deck-theme-${deck.presentation.theme}`} aria-hidden="true">
      <img src={details.imageUrl} alt="" draggable={false} />
    </div>
  );
}
