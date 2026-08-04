import { Shield, Skull, Swords } from "lucide-react";
import type { EncounterTone } from "../data/deckCatalog";
import type { GameMode } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  chronicleName: string;
  chronicleTheme: string;
  hostName: string;
  hostTheme: string;
  encounterTone: EncounterTone;
  gameMode: GameMode;
};

export function EncounterTransition({ chronicleName, chronicleTheme, hostName, hostTheme, encounterTone, gameMode }: Props) {
  const t = useTranslation();
  const tone = gameMode === "chaos" ? "chaos" : encounterTone;

  return (
    <div className={`encounter-transition is-${tone}`} role="status" aria-live="polite" data-audio-click="off">
      <div className="encounter-transition-vignette" />
      <div className="encounter-transition-rift" />
      <div className="encounter-transition-content">
        <p>{gameMode === "chaos" ? t("encounter.chaos") : t("encounter.standard")}</p>
        <div className="encounter-transition-matchup">
          <div className={`encounter-transition-side encounter-transition-side-player deck-theme-${chronicleTheme}`}>
            <span className="encounter-transition-eyebrow"><Shield size={12} />{t("setup.playerSide")}</span>
            <strong className="encounter-transition-name encounter-transition-name-player">{chronicleName}</strong>
          </div>
          <span className="encounter-transition-versus"><Swords size={34} /><b>VS</b></span>
          <div className={`encounter-transition-side encounter-transition-side-host deck-theme-${hostTheme}`}>
            <span className="encounter-transition-eyebrow"><Skull size={12} />{t("setup.hostSide")}</span>
            <strong className="encounter-transition-name encounter-transition-name-host">{hostName}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
