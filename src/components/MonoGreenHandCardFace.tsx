import { Sword } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import monoGreenCards from "../data/decks/player/mono_green_ramp/mono_green_ramp_card_generator.json";
import type { CardInstance } from "../engine/GameTypes";
import "./monoGreenHandCardExact.css";

const CARD_WIDTH = 976;
const CARD_HEIGHT = 1360;

type MonoGreenPresentationCard = {
  art_crop: string;
  atk: number | null;
  costo: number;
  def: number | null;
  desc: string;
  id: string;
  lore: string;
  nombre: string;
  tipo: string;
};

const presentationById = new Map(
  (monoGreenCards as MonoGreenPresentationCard[]).map((card, index) => [
    card.id,
    {
      ...card,
      artUrl: `/cards/mono_green_ramp/art/${card.id}.jpg`,
      cardNumber: String(index + 1).padStart(3, "0"),
    },
  ]),
);

export function hasMonoGreenHtmlCardFace(definitionId: string): boolean {
  return presentationById.has(definitionId);
}

export function MonoGreenHandCardFace({ card }: { card: CardInstance }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const presentation = presentationById.get(card.definitionId);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const fitCard = () => {
      const { clientHeight: height, clientWidth: width } = viewport;
      const scale = Math.min(width / CARD_WIDTH, height / CARD_HEIGHT);
      viewport.style.setProperty("--mono-green-exact-scale", String(scale));
      viewport.style.setProperty("--mono-green-exact-left", `${(width - CARD_WIDTH * scale) / 2}px`);
      viewport.style.setProperty("--mono-green-exact-top", `${(height - CARD_HEIGHT * scale) / 2}px`);
    };

    fitCard();
    const observer = new ResizeObserver(fitCard);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  if (!presentation) return null;

  const hasStats = presentation.atk !== null && presentation.def !== null;
  const hasEffect =
    presentation.desc.trim() !== "" &&
    presentation.desc.trim().toLocaleLowerCase() !== "sin efecto adicional.";
  const hasLore = presentation.lore.trim() !== "";
  const isLand = presentation.tipo.toLocaleLowerCase().includes("tierra");

  return (
    <div
      ref={viewportRef}
      className="mono-green-exact-viewport"
      role="img"
      aria-label={presentation.nombre}
    >
      <div className="mono-green-exact-scale">
        <div className="mono-green-exact-card">
          <div className="tcg-outer-border" />
          <div className="tcg-inner">
            <div className="tcg-head">
              <div className="tcg-title-wrap">
                <div className="tcg-element-icon">
                  <i className="fa-solid fa-leaf" />
                </div>
                <div className="tcg-title">{presentation.nombre}</div>
              </div>
              {!isLand && (
                <div className="tcg-mana-gem">
                  <span>{presentation.costo}</span>
                </div>
              )}
            </div>

            <div className="tcg-art-frame">
              <img
                src={presentation.artUrl}
                alt={presentation.nombre}
                className="tcg-art-image"
                draggable={false}
                onError={(event) => {
                  if (event.currentTarget.src !== presentation.art_crop) {
                    event.currentTarget.src = presentation.art_crop;
                  }
                }}
              />
            </div>

            <div className="tcg-typeband">
              <div className="tcg-type-text">
                <TypeIcon type={presentation.tipo} />
                {presentation.tipo}
              </div>
            </div>

            <div className="tcg-body">
              {!isLand && hasEffect && (
                <p className="tcg-effect">{formatEffectText(presentation.desc)}</p>
              )}
              {!isLand && hasEffect && hasLore && <div className="tcg-divider" />}
              {(isLand || !hasEffect) && hasLore ? (
                <p className="tcg-flavor tcg-flavor-solo">{presentation.lore}</p>
              ) : !isLand && hasLore ? (
                <p className={["tcg-flavor", hasEffect ? "" : "tcg-flavor-solo"].join(" ")}>
                  {presentation.lore}
                </p>
              ) : null}
              <div className="tcg-footer-info">
                HFA1 #{presentation.cardNumber} • Hostfall TCG
              </div>
            </div>
          </div>

          {hasStats && (
            <div className="tcg-stats-badge">
              <div className="tcg-stat-item tcg-stat-atk">
                <div className="tcg-stat-icon">
                  <Sword
                    aria-hidden="true"
                    style={{ width: 42, height: 42, transform: "scaleX(-1)" }}
                  />
                </div>
                <span className="tcg-stat-val">{presentation.atk}</span>
              </div>
              <span className="tcg-stat-sep">/</span>
              <div className="tcg-stat-item tcg-stat-def">
                <div className="tcg-stat-icon">
                  <i className="fa-solid fa-heart" />
                </div>
                <span className="tcg-stat-val">{presentation.def}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeIcon({ type }: { type: string }) {
  if (type.includes("Criatura")) {
    return <i className="fa-solid fa-paw" style={{ fontSize: 28, color: "#86efac" }} />;
  }
  if (type.includes("Instantáneo") || type.includes("Conjuro")) {
    return <i className="fa-solid fa-scroll" style={{ fontSize: 28, color: "#86efac" }} />;
  }
  if (type.includes("Tierra")) {
    return <i className="fa-solid fa-mountain-sun" style={{ fontSize: 28, color: "#86efac" }} />;
  }
  return <i className="fa-solid fa-gem" style={{ fontSize: 28, color: "#86efac" }} />;
}

function formatEffectText(text: string) {
  return text.split(/(\{\{T\}\}|\{[GE]\}|\+\d+\/\+\d+)/g).map((part, index) => {
    if (part === "{{T}}") {
      return (
        <span
          key={`${part}-${index}`}
          className="symbol-badge symbol-tap"
          title="Agotar / Activar"
        >
          <i className="fa-solid fa-hourglass-half" />
        </span>
      );
    }
    if (part === "{G}" || part === "{E}") {
      return (
        <span
          key={`${part}-${index}`}
          className="symbol-badge symbol-energy"
          title="Energía"
        >
          <i className="fa-solid fa-bolt-lightning" />
        </span>
      );
    }
    if (/^\+\d+\/\+\d+$/.test(part)) {
      return <strong key={`${part}-${index}`}>{part}</strong>;
    }
    return part;
  });
}
