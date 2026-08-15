import { Orbit } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";

export type DestinyTransitionKind = "rewrite" | "contemplate";

type Props = {
  kind: DestinyTransitionKind;
  seed: string;
  onCovered: () => void;
  onComplete: () => void;
};

const COVER_MS = 980;
const COMPLETE_MS = 1_820;
const REDUCED_COVER_MS = 120;
const REDUCED_COMPLETE_MS = 300;
const PARTICLE_COUNT = 34;

export function DestinyRewriteTransition({ kind, seed, onCovered, onComplete }: Props) {
  const t = useTranslation();
  const playSfx = useAudioStore((state) => state.playSfx);
  const [phase, setPhase] = useState<"absorbing" | "revealing">("absorbing");
  const futureCode = futureCodeFromSeed(seed);
  const particles = useMemo(() => Array.from({ length: PARTICLE_COUNT }, (_, index) => destinyParticleStyle(index)), []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coverMs = reducedMotion ? REDUCED_COVER_MS : COVER_MS;
    const completeMs = reducedMotion ? REDUCED_COMPLETE_MS : COMPLETE_MS;

    document.body.classList.add("destiny-rewrite-active", "destiny-rewrite-absorbing");
    playSfx("activateEffect", { rate: 0.72 });

    const coverTimer = window.setTimeout(() => {
      document.body.classList.remove("destiny-rewrite-absorbing");
      document.body.classList.add("destiny-rewrite-revealing");
      setPhase("revealing");
      onCovered();
      playSfx("drawOne", { rate: 0.78 });
    }, coverMs);
    const completeTimer = window.setTimeout(onComplete, completeMs);

    return () => {
      window.clearTimeout(coverTimer);
      window.clearTimeout(completeTimer);
      document.body.classList.remove("destiny-rewrite-active", "destiny-rewrite-absorbing", "destiny-rewrite-revealing");
    };
  }, [onComplete, onCovered, playSfx]);

  return (
    <div
      className={`destiny-vortex-overlay is-${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={t(kind === "rewrite" ? "destiny.transitionRewrite" : "destiny.transitionContemplate", { code: futureCode })}
    >
      <div className="destiny-vortex-veil" />
      <div className="destiny-vortex-disc" aria-hidden="true">
        <div className="destiny-vortex-ring destiny-vortex-ring-outer" />
        <div className="destiny-vortex-ring destiny-vortex-ring-middle" />
        <div className="destiny-vortex-ring destiny-vortex-ring-inner" />
        <div className="destiny-vortex-particles">
          {particles.map((style, index) => <i key={index} style={style} />)}
        </div>
        <div className="destiny-vortex-core"><Orbit size={58} strokeWidth={0.8} /></div>
      </div>
      <div className="destiny-vortex-caption">
        <small>{t("destiny.future", { code: futureCode })}</small>
        <strong>{t(kind === "rewrite" ? "destiny.rewriting" : "destiny.contemplating")}</strong>
      </div>
    </div>
  );
}

function destinyParticleStyle(index: number): CSSProperties {
  const angle = (index * 137.508) % 360;
  const radius = 19 + ((index * 29) % 32);
  const size = 1.5 + ((index * 7) % 5) * 0.55;
  const delay = -((index * 73) % 900);
  const duration = 820 + ((index * 41) % 520);
  return {
    "--destiny-angle": `${angle}deg`,
    "--destiny-radius": `${radius}vmin`,
    "--destiny-particle-size": `${size}px`,
    "--destiny-particle-delay": `${delay}ms`,
    "--destiny-particle-duration": `${duration}ms`,
  } as CSSProperties;
}
