import { Heart, Swords } from "lucide-react";
import { CARD_TYPE_VOCABULARY, canonicalCardTypeLine, vocabularyText } from "../i18n/gameVocabulary";
import { canonicalizeRulesText } from "../i18n/rulesText";
import { useLanguageStore } from "../store/useLanguageStore";
import { renderCardText } from "../utils/cardTextSymbols";

export type HostfallCardFaceProps = {
  name: string;
  imageUrl?: string;
  manaValue?: number;
  typeLine?: string;
  cardTypes?: string[];
  subtypes?: string[];
  rulesText?: string;
  flavorText?: string;
  power?: number | null;
  toughness?: number | null;
  cutted?: boolean;
  damaged?: boolean;
  buffed?: boolean;
  credit?: string;
  className?: string;
};

export function HostfallCardFace({
  name,
  imageUrl,
  manaValue,
  typeLine: authoredTypeLine,
  cardTypes = [],
  subtypes = [],
  rulesText = "",
  flavorText = "",
  power,
  toughness,
  cutted = false,
  damaged = false,
  buffed = false,
  credit = "HOSTFALL — ORIGINAL CARD",
  className = "",
}: HostfallCardFaceProps) {
  const language = useLanguageStore((state) => state.language);
  const typeLine = authoredTypeLine ?? canonicalCardTypeLine(cardTypes, subtypes, language);
  const visibleRulesText = canonicalizeRulesText(rulesText, language);
  const hasStats = typeof power === "number" && typeof toughness === "number";
  const isEnergy = cardTypes.includes("Energy") || cardTypes.includes("Land");
  const hasCost = typeof manaValue === "number" && !isEnergy;
  const textDensity = visibleRulesText.length > 320 ? "is-text-very-dense" : visibleRulesText.length > 210 ? "is-text-dense" : "";

  if (cutted) {
    return (
      <div
        className={["hostfall-cutted hostfall-light", damaged ? "is-damaged" : "", buffed ? "is-buffed" : "", className].filter(Boolean).join(" ")}
        role="img"
        aria-label={`${name}${hasStats ? language === "es" ? `, ${power} de Fuerza, ${toughness} de Aguante` : `, ${power} Power, ${toughness} Endurance` : ""}`}
      >
        {imageUrl && <img className="hostfall-cutted-art" src={imageUrl} alt="" draggable={false} />}
        <div className="hostfall-cutted-frame" aria-hidden="true" />
        <div className="hostfall-cutted-inner">
          <div className="hostfall-cutted-name">{name}</div>
          <div className="hostfall-cutted-spacer" />
          {typeLine && <div className="hostfall-cutted-type">{typeLine}</div>}
        </div>
        {hasStats && (
          <div className="hostfall-cutted-stats" aria-label={language === "es" ? `${power} de Fuerza, ${toughness} de Aguante` : `${power} Power, ${toughness} Endurance`}>
            <span className="hostfall-cutted-stat hostfall-cutted-atk"><Swords aria-hidden="true" /><b>{power}</b></span>
            <i aria-hidden="true" />
            <span className="hostfall-cutted-stat hostfall-cutted-def"><Heart aria-hidden="true" /><b>{toughness}</b></span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={["hostfall-standard hostfall-light", isEnergy ? "is-energy" : "", textDensity, damaged ? "is-damaged" : "", buffed ? "is-buffed" : "", className].filter(Boolean).join(" ")} role="img" aria-label={name}>
      <div className="hostfall-standard-frame" aria-hidden="true" />
      <div className="hostfall-standard-inner">
        <header className="hostfall-standard-head">
          <div className="hostfall-standard-title">{name}</div>
          {hasCost && <div className="hostfall-standard-cost" aria-label={language === "es" ? `Coste de Energía ${manaValue}` : `Energy cost ${manaValue}`}><span>{manaValue}</span></div>}
        </header>

        <div className="hostfall-standard-art">
          {imageUrl && <img src={imageUrl} alt="" draggable={false} />}
        </div>

        <div className="hostfall-standard-typeband">
          <div className="hostfall-standard-subtype">{typeLine || vocabularyText(CARD_TYPE_VOCABULARY.CARD, language)}</div>
        </div>

        <div className="hostfall-standard-body">
          {hasStats && <div className="hostfall-standard-stats-flow" aria-hidden="true" />}
          {visibleRulesText && <p className="hostfall-standard-effect">{renderCardText(visibleRulesText)}</p>}
          {visibleRulesText && flavorText && <div className="hostfall-standard-rule" aria-hidden="true" />}
          {flavorText && <p className="hostfall-standard-flavor">{flavorText}</p>}
          <div className="hostfall-standard-credits">{credit}</div>

          {hasStats && (
            <div className="hostfall-standard-stats" aria-label={language === "es" ? `${power} de Fuerza, ${toughness} de Aguante` : `${power} Power, ${toughness} Endurance`}>
              <span className="hostfall-standard-atk">{power}</span>
              <span className="hostfall-standard-sep">/</span>
              <span className="hostfall-standard-def">{toughness}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
