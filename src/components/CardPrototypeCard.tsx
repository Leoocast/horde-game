import { Leaf, Shield, Swords } from "lucide-react";
import type { NewDeckCard } from "../data/deckCatalog";

type Props = {
  card: NewDeckCard;
  className?: string;
};

export function isCardPrototype(card: NewDeckCard | undefined): boolean {
  return Boolean(card?.prototypeStyle);
}

export function CardPrototypeCard({ card, className = "" }: Props) {
  const cost = typeof card.manaValue === "number" ? card.manaValue : 1;
  const rulesText = typeof card.prototypeRules === "string" ? card.prototypeRules : "";
  const flavorText = typeof card.prototypeFlavor === "string" ? card.prototypeFlavor : "";
  const art = typeof card.prototypeArt === "string" ? card.prototypeArt : "";
  const style = typeof card.prototypeStyle === "string" ? card.prototypeStyle : "verdant";
  const study = typeof card.prototypeStudy === "string" ? card.prototypeStudy : "I";
  const typeLine = (card.cardTypes ?? []).join(" ") || "Creature";
  const subtypes = card.subtypes?.join(" ") || "Toucan Druid";
  const power = typeof card.power === "number" ? card.power : 0;
  const toughness = typeof card.toughness === "number" ? card.toughness : 2;

  return (
    <article
      className={`sunshower-card sunshower-card--${style} ${className}`}
      role="img"
      aria-label={`${card.name}, ${typeLine} — ${subtypes}, ${power}/${toughness}`}
    >
      <div className="sunshower-card__texture" aria-hidden="true" />
      <div className="sunshower-card__frame" aria-hidden="true" />

      <header className="sunshower-card__header">
        <div className="sunshower-card__cost" aria-label={`Mana value ${cost}`}>
          <span>{cost}</span>
        </div>
        <h3>{card.name}</h3>
        <div className="sunshower-card__emblem" aria-label="Green identity">
          <Leaf aria-hidden="true" fill="currentColor" />
        </div>
        <div className="sunshower-card__type">
          <span>{typeLine}</span>
          <i aria-hidden="true">—</i>
          <span>{subtypes}</span>
        </div>
      </header>

      <div className="sunshower-card__art">
        {art ? <img src={art} alt="" draggable={false} /> : <div className="sunshower-card__art-fallback" />}
        <div className="sunshower-card__art-grade" aria-hidden="true" />
      </div>

      <div className="sunshower-card__ornament" aria-hidden="true">
        <span />
        <b><i /></b>
        <span />
      </div>

      <section className="sunshower-card__rules">
        <p>{rulesText}</p>
        {flavorText && <blockquote>{flavorText}</blockquote>}
      </section>

      <footer className="sunshower-card__footer">
        <div className="sunshower-card__stat sunshower-card__stat--power" aria-label={`Power ${power}`}>
          <Swords aria-hidden="true" />
          <strong>{power}</strong>
        </div>
        <div className="sunshower-card__setline">
          <span>SET 1</span><i aria-hidden="true" />
          <span>0{study}/250</span><i aria-hidden="true" />
          <span>ILLUS. D. SPENCER</span>
        </div>
        <div className="sunshower-card__stat sunshower-card__stat--toughness" aria-label={`Toughness ${toughness}`}>
          <strong>{toughness}</strong>
          <Shield aria-hidden="true" />
        </div>
      </footer>

      <div className="sunshower-card__finish" aria-hidden="true" />
    </article>
  );
}
