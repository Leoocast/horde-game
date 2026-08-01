import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { useAudioStore } from "../store/useAudioStore";
import { VampireBite } from "./VampireBite";

type BloodDrop = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  opacity: number;
};

type Props = {
  animationId: string;
  primarySelector: string;
  fallbackSelector?: string;
  fallbackAnchor: "player" | "host";
  onComplete: (id: string) => void;
  playSound?: boolean;
};

export function VampireBiteImpact({
  animationId,
  primarySelector,
  fallbackSelector,
  fallbackAnchor,
  onComplete,
  playSound = true,
}: Props) {
  const playSfx = useAudioStore((state) => state.playSfx);
  const biteRef = useRef<HTMLDivElement>(null);
  const splashCanvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const biteElement = biteRef.current;
    const splashCanvas = splashCanvasRef.current;
    if (!biteElement || !splashCanvas) {
      onComplete(animationId);
      return;
    }

    const anchor =
      document.querySelector<HTMLElement>(primarySelector) ??
      (fallbackSelector ? document.querySelector<HTMLElement>(fallbackSelector) : undefined);
    const anchorRect = anchor?.getBoundingClientRect();
    const fallbackX = fallbackAnchor === "player" ? window.innerWidth - 56 : window.innerWidth / 2;
    const fallbackY = fallbackAnchor === "player" ? window.innerHeight - 56 : 112;
    const anchorX = anchorRect ? anchorRect.left + anchorRect.width / 2 : fallbackX;
    const anchorY = anchorRect ? anchorRect.top + anchorRect.height / 2 : fallbackY;
    gsap.set(biteElement, { left: anchorX - 85, top: anchorY - 85 });

    const context = splashCanvas.getContext("2d");
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    splashCanvas.width = Math.round(window.innerWidth * pixelRatio);
    splashCanvas.height = Math.round(window.innerHeight * pixelRatio);
    splashCanvas.style.width = `${window.innerWidth}px`;
    splashCanvas.style.height = `${window.innerHeight}px`;
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    let splashFrame = 0;
    let lastFrameTime = 0;
    let splashAge = 0;
    let bloodDrops: BloodDrop[] = [];

    const drawSplash = (time: number) => {
      if (!context) return;
      const frameScale = lastFrameTime === 0
        ? 1
        : Math.min((time - lastFrameTime) / (1000 / 60), 3);
      lastFrameTime = time;
      splashAge += frameScale;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const impactProgress = Math.min(splashAge / 18, 1);
      if (impactProgress < 1) {
        const impactOpacity = (1 - impactProgress) * 0.82;
        const impactRadius = 25 + impactProgress * 58;
        const impactGradient = context.createRadialGradient(
          anchorX,
          anchorY,
          2,
          anchorX,
          anchorY,
          impactRadius,
        );
        impactGradient.addColorStop(0, `rgb(255 83 104 / ${impactOpacity})`);
        impactGradient.addColorStop(0.3, `rgb(211 0 31 / ${impactOpacity * 0.9})`);
        impactGradient.addColorStop(1, "rgb(91 0 13 / 0)");
        context.fillStyle = impactGradient;
        context.beginPath();
        context.arc(anchorX, anchorY, impactRadius, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = `rgb(255 36 66 / ${impactOpacity * 0.85})`;
        context.lineWidth = Math.max(5 * (1 - impactProgress), 1);
        context.shadowColor = `rgb(255 0 43 / ${impactOpacity})`;
        context.shadowBlur = 16;
        context.beginPath();
        context.arc(anchorX, anchorY, 18 + impactProgress * 50, 0, Math.PI * 2);
        context.stroke();
      }

      bloodDrops = bloodDrops.filter((drop) => drop.opacity > 0.02 && drop.radius > 0.45);
      for (const drop of bloodDrops) {
        drop.x += drop.velocityX * frameScale;
        drop.y += drop.velocityY * frameScale;
        drop.velocityY += 0.28 * frameScale;
        drop.radius *= 0.975 ** frameScale;
        drop.opacity -= 0.035 * frameScale;

        const gradient = context.createRadialGradient(
          drop.x - drop.radius * 0.3,
          drop.y - drop.radius * 0.35,
          drop.radius * 0.08,
          drop.x,
          drop.y,
          drop.radius,
        );
        gradient.addColorStop(0, `rgb(255 79 98 / ${Math.max(drop.opacity, 0)})`);
        gradient.addColorStop(0.35, `rgb(194 0 27 / ${Math.max(drop.opacity, 0)})`);
        gradient.addColorStop(1, `rgb(61 0 8 / ${Math.max(drop.opacity * 0.92, 0)})`);
        context.fillStyle = gradient;
        context.shadowColor = `rgb(255 0 43 / ${Math.max(drop.opacity * 0.75, 0)})`;
        context.shadowBlur = 13;
        context.beginPath();
        context.ellipse(
          drop.x,
          drop.y,
          drop.radius,
          drop.radius * (1 + Math.min(Math.abs(drop.velocityY) * 0.035, 0.28)),
          Math.atan2(drop.velocityY, drop.velocityX) + Math.PI / 2,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      context.shadowBlur = 0;
      if (bloodDrops.length > 0) splashFrame = window.requestAnimationFrame(drawSplash);
      else context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const triggerSplash = () => {
      if (!context) return;
      window.cancelAnimationFrame(splashFrame);
      lastFrameTime = 0;
      splashAge = 0;
      bloodDrops = Array.from({ length: 32 }, (_, index) => {
        const angle = (index / 32) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 3.5 + Math.random() * 7;
        return {
          x: anchorX + (Math.random() - 0.5) * 18,
          y: anchorY + (Math.random() - 0.5) * 14,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed - 1.9,
          radius: 4.5 + Math.random() * 6,
          opacity: 0.92 + Math.random() * 0.08,
        };
      });
      splashFrame = window.requestAnimationFrame(drawSplash);
    };

    const timeline = gsap.timeline();
    timeline
      .call(() => biteElement.classList.add("is-active"), [], 0)
      .call(() => {
        biteElement.classList.add("is-biting");
        triggerSplash();
        if (playSound) playSfx("bloodSplash");
      }, [], 0.05)
      .call(() => biteElement.classList.remove("is-biting", "is-active"), [], 0.32)
      .call(() => onComplete(animationId), [], 0.68);

    return () => {
      timeline.kill();
      window.cancelAnimationFrame(splashFrame);
      context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
      biteElement.classList.remove("is-biting", "is-active");
    };
  }, [animationId, fallbackAnchor, fallbackSelector, onComplete, playSfx, playSound, primarySelector]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="life-payment-animation-layer" aria-hidden="true">
      <canvas ref={splashCanvasRef} className="life-payment-blood-splash-canvas" />
      <VampireBite animationId={animationId} elementRef={biteRef} />
    </div>,
    document.body,
  );
}
