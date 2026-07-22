import { Skull } from "lucide-react";
import { useEffect } from "react";
import { useAudioStore } from "../store/useAudioStore";
import { useTranslation } from "../i18n/useTranslation";

type Props = {
  onComplete: () => void;
};

export function SurgeTransition({ onComplete }: Props) {
  const t = useTranslation();
  const playSfx = useAudioStore((state) => state.playSfx);

  useEffect(() => {
    playSfx("playMonsterHeavy", { volume: 0.92, rate: 0.88 });
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
        <span className="game-result-line" />
        <span className="game-result-crest"><Skull size={32} strokeWidth={1.7} /></span>
        <h1>{t("surge.title")}</h1>
        <span className="game-result-line game-result-line-right" />
      </div>
      <p className="surge-transition-message">{t("surge.message")}</p>
    </div>
  );
}
