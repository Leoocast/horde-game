import { useEffect, useState } from "react";
import { Github } from "lucide-react";

type Props = {
  percent: number;
  label: string;
  leaving?: boolean;
};

export function GameLoadingScreen({ percent, label, leaving = false }: Props) {
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    setDisplayPercent((current) => Math.max(current, percent));
  }, [percent]);

  return (
    <main className={`game-loading-screen ${leaving ? "is-leaving" : ""}`} aria-label="Loading Hostfall">
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
        <p>Chronicles of the Shattered Realms</p>
        <h1>Hostfall</h1>
        <div className="game-loading-divider" aria-hidden="true"><span /><b>◆</b><span /></div>
        <div className="game-loading-status" aria-live="polite">
          <span>{label}</span>
          <strong>{displayPercent}%</strong>
        </div>
        <div className="game-loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}>
          <i style={{ width: `${displayPercent}%` }} />
        </div>
        <small>Preparing images &amp; audio</small>
      </section>
      <footer className="game-loading-credits">
        <span>Version: ALPHA 4.0-HAND-UPDATE</span>
        <a href="https://github.com/Leoocast" target="_blank" rel="noopener noreferrer">
          <span>Developed by</span><Github aria-hidden="true" /><strong>Leoocast</strong>
        </a>
      </footer>
    </main>
  );
}
