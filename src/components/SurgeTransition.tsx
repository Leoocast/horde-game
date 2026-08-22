import { useEffect } from "react";
import { useAudioStore } from "../store/useAudioStore";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  onComplete: () => void;
};

// Las pavesas viven dentro de cada regla, que es lo que arde: así su reparto es siempre relativo al
// tramo visible y nunca cae sobre la palabra, mida lo que mida el título en cada idioma.
const EMBERS_PER_LINE = 5;

function emberRow() {
  return Array.from({ length: EMBERS_PER_LINE }, (_, index) => <i key={index} />);
}

export function SurgeTransition({ onComplete }: Props) {
  const t = useTranslation();
  const playSfx = useAudioStore((state) => state.playSfx);

  useEffect(() => {
    playSfx("playMonsterHeavy", { rate: 0.88 });
  }, [playSfx]);

  return (
    <div
      className="surge-transition fixed inset-0 z-[440] flex flex-col items-center justify-center"
      role="status"
      aria-live="assertive"
      data-audio-click="off"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onComplete();
      }}
    >
      <div className="game-result-atmosphere" />
      <div className="surge-transition-rift" aria-hidden="true" />
      <div className="game-result-banner" aria-hidden="true">
        <h1>
          <span className="game-result-line">{emberRow()}</span>
          <span className="game-result-word">{t("surge.title")}</span>
          <span className="game-result-line game-result-line-right">{emberRow()}</span>
        </h1>
      </div>
      <p className="surge-transition-message">{t("surge.message")}</p>
    </div>
  );
}
