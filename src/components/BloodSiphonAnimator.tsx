import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { RoughEase } from "gsap/EasePack";
import * as THREE from "three";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";

gsap.registerPlugin(RoughEase);

type BloodParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  alpha: number;
  baseScale: THREE.Vector3;
  scaleMultiplier: number;
  type: "bite" | "burst" | "stream" | "impact";
  phase: number;
};

class OrganicBloodStain {
  private currentRadius = 5;
  private readonly growthSpeed = 10 + Math.random() * 8;
  private readonly offsets = Array.from({ length: 14 }, () => 0.65 + Math.random() * 0.55);
  private readonly satellites = Array.from({ length: 5 }, () => ({
    angle: Math.random() * Math.PI * 2,
    distRatio: 1.05 + Math.random() * 0.3,
    radiusRatio: 0.08 + Math.random() * 0.12,
  }));
  private active = true;

  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly maxRadius: number,
  ) {}

  update(dt60: number): void {
    if (!this.active) return;
    this.currentRadius += this.growthSpeed * dt60;
    if (this.currentRadius >= this.maxRadius) {
      this.currentRadius = this.maxRadius;
      this.active = false;
    }
  }

  draw(context: CanvasRenderingContext2D): void {
    context.save();
    context.beginPath();
    const radius = this.currentRadius;
    for (let index = 0; index <= this.offsets.length; index += 1) {
      const angle = (index / this.offsets.length) * Math.PI * 2;
      const nextAngle = ((index + 1) / this.offsets.length) * Math.PI * 2;
      const lobRadius = radius * this.offsets[index % this.offsets.length];
      const nextLobRadius = radius * this.offsets[(index + 1) % this.offsets.length];
      const x = this.x + Math.cos(angle) * lobRadius;
      const y = this.y + Math.sin(angle) * lobRadius;
      const nextX = this.x + Math.cos(nextAngle) * nextLobRadius;
      const nextY = this.y + Math.sin(nextAngle) * nextLobRadius;
      if (index === 0) context.moveTo(x, y);
      context.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
    }
    context.closePath();

    const gradient = context.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
    gradient.addColorStop(0, "rgba(80, 0, 15, 0.98)");
    gradient.addColorStop(0.55, "rgba(52, 0, 9, 0.90)");
    gradient.addColorStop(0.85, "rgba(30, 0, 5, 0.65)");
    gradient.addColorStop(1, "rgba(15, 0, 2, 0)");
    context.fillStyle = gradient;
    context.fill();

    if (radius > 12) {
      for (const satellite of this.satellites) {
        context.beginPath();
        context.arc(
          this.x + Math.cos(satellite.angle) * radius * satellite.distRatio,
          this.y + Math.sin(satellite.angle) * radius * satellite.distRatio,
          Math.max(1.5, radius * satellite.radiusRatio),
          0,
          Math.PI * 2,
        );
        context.fillStyle = "rgba(160, 0, 20, 0.88)";
        context.fill();
      }
    }
    context.restore();
  }
}

export function BloodPactAnimator() {
  const game = useGameStore((state) => state.game);
  const active = useGameStore((state) => state.bloodPactAnimation);
  const setPhase = useGameStore((state) => state.setBloodPactAnimationPhase);
  const complete = useGameStore((state) => state.completeBloodPactAnimation);
  const playSfx = useAudioStore((state) => state.playSfx);
  const cardRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const biteRef = useRef<HTMLDivElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const stainCanvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const cardElement = cardRef.current;
    const vignetteElement = vignetteRef.current;
    const biteElement = biteRef.current;
    const threeCanvas = threeCanvasRef.current;
    const stainCanvas = stainCanvasRef.current;
    if (!cardElement || !vignetteElement || !biteElement || !threeCanvas || !stainCanvas) return;

    const origin = active.origin ?? {
      left: window.innerWidth * 0.5 - 82,
      top: window.innerHeight - 196,
      width: 164,
      height: 228,
    };
    const targetWidth = Math.max(224, Math.min(288, window.innerWidth * 0.173));
    const targetHeight = targetWidth * (680 / 488);
    const centeredLeft = (window.innerWidth - targetWidth) / 2;
    const previousRightLeft = window.innerWidth - Math.min(window.innerWidth * 0.05, 64) - targetWidth;
    const targetLeft = centeredLeft + (previousRightLeft - centeredLeft) * 0.5;
    const targetTop = (window.innerHeight - targetHeight) / 2 - Math.min(window.innerHeight * 0.05, 42);
    const startLeft = origin.left + (origin.width - targetWidth) / 2;
    const startTop = origin.top + (origin.height - targetHeight) / 2;
    const startScale = origin.width / targetWidth;
    const lifeEmblem =
      document.querySelector<HTMLElement>('[data-player-life-emblem="true"]') ??
      document.querySelector<HTMLElement>('[data-player-life-panel="true"]');
    const lifeRect = lifeEmblem?.getBoundingClientRect();
    const lifeX = lifeRect ? lifeRect.left + lifeRect.width / 2 : window.innerWidth - 56;
    const lifeY = lifeRect ? lifeRect.top + lifeRect.height / 2 : window.innerHeight - 56;

    cardElement.style.width = `${targetWidth}px`;
    cardElement.style.height = `${targetHeight}px`;
    gsap.set(cardElement, {
      left: startLeft,
      top: startTop,
      x: 0,
      y: 0,
      scale: startScale,
      rotation: 0,
      opacity: 1,
      filter: "none",
      transformOrigin: "50% 50%",
    });
    gsap.set(vignetteElement, { opacity: 0.38 });
    gsap.set(biteElement, { left: lifeX - 85, top: lifeY - 85 });

    const stainContext = stainCanvas.getContext("2d");
    const offscreen = document.createElement("canvas");
    offscreen.width = 270;
    offscreen.height = 390;
    const offscreenContext = offscreen.getContext("2d");
    stainCanvas.width = 270;
    stainCanvas.height = 390;
    let stains: OrganicBloodStain[] = [];
    let staining = false;
    const stainTimers: number[] = [];

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.z = 900;
    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    } catch {
      renderer = undefined;
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const pointLight = new THREE.PointLight(0x8c0014, 4, 1200);
    pointLight.position.set(0, 0, 450);
    scene.add(pointLight);
    const specularLight = new THREE.DirectionalLight(0x9e1026, 1.6);
    specularLight.position.set(300, 600, 500);
    scene.add(specularLight);

    const material = new THREE.MeshPhongMaterial({
      color: 0x42000c,
      emissive: 0x1d0005,
      specular: 0x8a001a,
      shininess: 190,
      transparent: true,
      opacity: 0.98,
    });
    const sphereGeometry = new THREE.SphereGeometry(1, 24, 24);
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    let particles: BloodParticle[] = [];
    let streamActive = false;
    let streamProgress = 0;
    let streamTailProgress = 0;
    let streamSpawnAccumulator = 0;
    let impactTriggered = false;
    let startPosition = new THREE.Vector3();
    let endPosition = new THREE.Vector3();
    let controlPosition = new THREE.Vector3();

    const screenTo3D = (screenX: number, screenY: number, targetZ: number) => {
      const vector = new THREE.Vector3(
        (screenX / window.innerWidth) * 2 - 1,
        -(screenY / window.innerHeight) * 2 + 1,
        0.5,
      );
      vector.unproject(camera);
      vector.sub(camera.position).normalize();
      const distance = (targetZ - camera.position.z) / vector.z;
      return camera.position.clone().add(vector.multiplyScalar(distance));
    };

    const addParticle = (
      position: THREE.Vector3,
      velocity: THREE.Vector3,
      scale: THREE.Vector3,
      type: BloodParticle["type"],
      phase = 0,
    ) => {
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.position.copy(position);
      mesh.scale.copy(scale);
      particleGroup.add(mesh);
      particles.push({
        mesh,
        velocity,
        alpha: 1,
        baseScale: scale,
        scaleMultiplier: 1,
        type,
        phase,
      });
    };

    const clearParticles = () => {
      for (const particle of particles) particleGroup.remove(particle.mesh);
      particles = [];
    };

    const triggerBiteBurst = () => {
      const position = screenTo3D(lifeX, lifeY, 60);
      for (let index = 0; index < 18; index += 1) {
        const radius = 3 + Math.random() * 6;
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        addParticle(
          position,
          new THREE.Vector3(
            Math.cos(angle) * speed,
            (Math.random() - 0.2) * speed,
            (Math.random() - 0.3) * 6 + 2,
          ),
          new THREE.Vector3(radius, radius, radius),
          "bite",
        );
      }
    };

    const triggerCardStaining = () => {
      if (!stainContext || !offscreenContext) return;
      staining = true;
      stains = [
        new OrganicBloodStain(135, 195, 190),
        new OrganicBloodStain(110, 150, 130),
        new OrganicBloodStain(160, 240, 140),
      ];
      offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
      stainContext.clearRect(0, 0, stainCanvas.width, stainCanvas.height);
      for (let index = 0; index < 18; index += 1) {
        stainTimers.push(window.setTimeout(() => {
          if (!staining) return;
          stains.push(new OrganicBloodStain(
            15 + Math.random() * 240,
            25 + Math.random() * 340,
            40 + Math.random() * 85,
          ));
        }, index * 10));
      }
    };

    const triggerImpact = () => {
      if (impactTriggered) return;
      impactTriggered = true;
      for (let index = 0; index < 32; index += 1) {
        const radius = 5 + Math.random() * 10;
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 9;
        addParticle(
          endPosition,
          new THREE.Vector3(
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            (Math.random() - 0.2) * 8 + 3,
          ),
          new THREE.Vector3(radius, radius, radius),
          "impact",
        );
      }
      triggerCardStaining();
      cardElement.classList.add("is-absorbing");
    };

    const triggerStream = () => {
      clearParticles();
      startPosition = screenTo3D(lifeX, lifeY, 60);
      endPosition = screenTo3D(
        targetLeft + targetWidth / 2,
        targetTop + targetHeight / 2,
        80,
      );
      controlPosition = new THREE.Vector3(
        (startPosition.x + endPosition.x) / 2 + 120,
        (startPosition.y + endPosition.y) / 2 + 160,
        100,
      );
      streamProgress = 0;
      streamTailProgress = 0;
      streamSpawnAccumulator = 0;
      impactTriggered = false;
      streamActive = true;
      for (let index = 0; index < 24; index += 1) {
        const radius = 4 + Math.random() * 8;
        addParticle(
          startPosition,
          new THREE.Vector3(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.2) * 14,
            (Math.random() - 0.5) * 10 + 3,
          ),
          new THREE.Vector3(radius, radius, radius),
          "burst",
        );
      }
    };

    const resize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer?.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", resize);

    let animationFrame = 0;
    let lastFrameTime = performance.now();
    const tick = (now: number) => {
      const deltaMs = Math.min(now - lastFrameTime, 64);
      lastFrameTime = now;
      const dt60 = deltaMs / (1000 / 60);
      const time = now * 0.008;

      if (streamActive) {
        if (streamProgress < 1) {
          streamProgress = Math.min(1, streamProgress + 0.038 * dt60);
          if (streamProgress === 1) triggerImpact();
          const inverse = 1 - streamProgress;
          const head = new THREE.Vector3(
            inverse * inverse * startPosition.x + 2 * inverse * streamProgress * controlPosition.x + streamProgress * streamProgress * endPosition.x,
            inverse * inverse * startPosition.y + 2 * inverse * streamProgress * controlPosition.y + streamProgress * streamProgress * endPosition.y,
            inverse * inverse * startPosition.z + 2 * inverse * streamProgress * controlPosition.z + streamProgress * streamProgress * endPosition.z,
          );
          streamSpawnAccumulator += 4 * dt60;
          while (streamSpawnAccumulator >= 1) {
            streamSpawnAccumulator -= 1;
            const wobblePhase = Math.random() * Math.PI * 2;
            const xScale = 8 + Math.sin(time * 5 + wobblePhase) * 6;
            const yScale = 12 + Math.cos(time * 5 + wobblePhase) * 6;
            const zScale = 8 + Math.sin(time * 4 + wobblePhase) * 4;
            addParticle(
              new THREE.Vector3(
                head.x + Math.sin(time * 3 + wobblePhase) * 14,
                head.y + Math.cos(time * 3 + wobblePhase) * 14,
                head.z + (Math.random() - 0.5) * 18,
              ),
              new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4,
              ),
              new THREE.Vector3(xScale, yScale, zScale),
              "stream",
              Math.random() * Math.PI * 2,
            );
          }
        } else {
          streamTailProgress = Math.min(1, streamTailProgress + 0.05 * dt60);
          if (streamTailProgress === 1) streamActive = false;
        }
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.mesh.position.addScaledVector(particle.velocity, dt60);
        particle.velocity.y -= 0.35 * dt60;
        particle.scaleMultiplier *= Math.pow(0.95, dt60);
        particle.alpha -= 0.03 * dt60;
        if (particle.type === "stream") {
          const deform = 1 + Math.sin(time * 6 + particle.phase) * 0.25;
          particle.mesh.scale.set(
            particle.baseScale.x * particle.scaleMultiplier * deform,
            particle.baseScale.y * particle.scaleMultiplier / deform,
            particle.baseScale.z * particle.scaleMultiplier,
          );
        } else {
          const scale = particle.baseScale.x * particle.scaleMultiplier;
          particle.mesh.scale.set(scale, scale, scale);
        }
        if (particle.alpha <= 0 || particle.scaleMultiplier < 0.05) {
          particleGroup.remove(particle.mesh);
          particles.splice(index, 1);
        }
      }

      if (staining && stainContext && offscreenContext) {
        offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
        for (const stain of stains) {
          stain.update(dt60);
          stain.draw(offscreenContext);
        }
        stainContext.clearRect(0, 0, stainCanvas.width, stainCanvas.height);
        stainContext.drawImage(offscreen, 0, 0);
      }

      renderer?.render(scene, camera);
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);

    const timeline = gsap.timeline({
      onComplete: () => complete(active.id),
    });
    timeline
      .to(vignetteElement, { opacity: 0.68, duration: 0.3, ease: "power2.out" }, 0)
      .to(cardElement, {
        left: targetLeft,
        top: targetTop,
        scale: 1.12,
        duration: 0.4,
        ease: "power2.out",
      }, 0)
      .to(cardElement, {
        y: "+=6",
        duration: 0.4,
        yoyo: true,
        repeat: 1,
        ease: "sine.inOut",
      }, 0.4)
      .call(() => {
        biteElement.classList.add("is-active");
      }, [], 0)
      .call(() => {
        biteElement.classList.add("is-biting");
        setPhase(active.id, "impact");
        playSfx("bloodSplash2", { volume: 0.72 });
        playSfx("punch", { volume: 0.65 });
        triggerBiteBurst();
      }, [], 0.05)
      .call(() => {
        biteElement.classList.remove("is-biting", "is-active");
      }, [], 0.32)
      .call(triggerStream, [], 0.22)
      .to(cardElement, {
        scale: 1.22,
        duration: 0.25,
        ease: "power2.in",
      }, 0.44)
      .to(cardElement, {
        rotation: 3,
        duration: 0.05,
        yoyo: true,
        repeat: 5,
        ease: "rough",
      }, 0.44)
      .to(cardElement, {
        scale: 0,
        opacity: 0,
        filter: "brightness(2.5) blur(16px)",
        duration: 0.28,
        ease: "back.in(1.5)",
      }, 0.74)
      .call(() => setPhase(active.id, "settling"), [], 0.84)
      .call(() => setPhase(active.id, "consumed"), [], 1.02)
      .to(vignetteElement, { opacity: 0, duration: 0.35, ease: "power1.out" }, 1.18);

    return () => {
      timeline.kill();
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      for (const timer of stainTimers) window.clearTimeout(timer);
      staining = false;
      clearParticles();
      sphereGeometry.dispose();
      material.dispose();
      renderer?.dispose();
    };
  }, [active?.id, complete, playSfx, setPhase]);

  if (!active || typeof document === "undefined") return null;
  const showFullImage = shouldShowFullCardImage(active.card.definitionId);

  return createPortal(
    <>
      <div ref={vignetteRef} className="blood-pact-vignette" aria-hidden="true" />
      <div key={active.id} className="blood-pact-animation-layer" aria-hidden="true">
        <canvas ref={threeCanvasRef} className="blood-pact-three-canvas" />
        <div ref={cardRef} className="blood-pact-card-host">
          <div className="blood-pact-card-shell">
            <Card
              game={game}
              card={active.card}
              selectionDisabled
              suppressContextMenu
              suppressHoverOverlay
              suppressCardId
              suppressSummoningSickness
              highRes
              showFullImage={showFullImage}
              showCostBadge={showFullImage}
              preferNativeImageRendering={showFullImage}
            />
            <span className="blood-pact-card-veins" />
            <canvas ref={stainCanvasRef} className="blood-pact-stain-canvas" />
          </div>
        </div>
        <div ref={biteRef} className="blood-pact-vampire-bite">
          <svg viewBox="-25 -25 170 170">
            <defs>
              <linearGradient id={`blood-pact-jaw-${active.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ff334b" />
                <stop offset="60%" stopColor="#b80018" />
                <stop offset="100%" stopColor="#4a000a" />
              </linearGradient>
              <filter id={`blood-pact-teeth-glow-${active.id}`}>
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ff002b" floodOpacity="0.95" />
              </filter>
            </defs>
            <g
              className="blood-pact-jaw-upper"
              fill={`url(#blood-pact-jaw-${active.id})`}
              stroke="#ff4d66"
              strokeWidth="1.5"
              filter={`url(#blood-pact-teeth-glow-${active.id})`}
            >
              <path d="M 16 28 C 14 44, 20 62, 34 76 C 30 58, 24 38, 22 28 Z" />
              <path d="M 104 28 C 106 44, 100 62, 86 76 C 90 58, 96 38, 98 28 Z" />
              <path d="M 30 28 L 40 28 L 35 44 Z" />
              <path d="M 43 28 L 55 28 L 49 46 Z" />
              <path d="M 65 28 L 77 28 L 71 46 Z" />
              <path d="M 80 28 L 90 28 L 85 44 Z" />
            </g>
            <g
              className="blood-pact-jaw-lower"
              fill={`url(#blood-pact-jaw-${active.id})`}
              stroke="#ff4d66"
              strokeWidth="1.5"
              filter={`url(#blood-pact-teeth-glow-${active.id})`}
            >
              <path d="M 24 88 C 22 72, 28 54, 36 44 C 34 60, 31 76, 30 88 Z" />
              <path d="M 96 88 C 98 72, 92 54, 84 44 C 86 60, 89 76, 90 88 Z" />
              <path d="M 35 88 L 43 88 L 39 74 Z" />
              <path d="M 46 88 L 54 88 L 50 72 Z" />
              <path d="M 66 88 L 74 88 L 70 72 Z" />
              <path d="M 77 88 L 85 88 L 81 74 Z" />
            </g>
          </svg>
        </div>
      </div>
    </>,
    document.body,
  );
}
