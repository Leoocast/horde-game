import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";
import type { LoadingLabel } from "../utils/assetPreloader";
import { APP_VERSION } from "../version";

type Props = {
  percent: number;
  label: LoadingLabel;
  leaving?: boolean;
};

export function GameLoadingScreen({ percent, label, leaving = false }: Props) {
  const t = useTranslation();
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    setDisplayPercent((current) => Math.max(current, percent));
  }, [percent]);

  return (
    <main className={`game-loading-screen ${leaving ? "is-leaving" : ""}`} aria-label={t("loading.aria")}>
      <div className="game-loading-embers" aria-hidden="true">
        {Array.from({ length: 22 }, (_, index) => (
          <i
            key={index}
            style={{
              "--ember-index": index,
              "--ember-left": `${(index * 47) % 100}%`,
              "--ember-duration": `${5 + (index % 5)}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <section className="game-loading-content">
        <p>{t("menu.kicker")}</p>
        <h1>Hostfall</h1>
        <div className="game-loading-divider" aria-hidden="true"><span /><b>◆</b><span /></div>
        <div className="game-loading-status" aria-live="polite">
          <span>{t(label === "opening" ? "loading.opening" : label === "sfx" ? "loading.sfx" : label === "music" ? "loading.music" : "loading.ready")}</span>
          <strong>{displayPercent}%</strong>
        </div>
        <div className="game-loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}>
          <i style={{ width: `${displayPercent}%` }} />
        </div>
        <small>{t("loading.preparing")}</small>
      </section>
      <footer className="game-loading-credits">
        <span>Version: {APP_VERSION}</span>
        <a href="https://github.com/Leoocast" target="_blank" rel="noopener noreferrer">
          <span>{t("common.developedBy")}</span><Github aria-hidden="true" /><strong>Leoocast</strong>
        </a>
      </footer>
    </main>
  );
}
