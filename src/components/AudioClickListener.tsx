import { useEffect } from "react";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";

export function AudioClickListener() {
  useEffect(() => {
    function unlockMusic() {
      useAudioStore.getState().resumeMusic();
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-audio-click='off']")) return;
      if (isPreviewReadTarget(target)) return;
      if (!isValidClickTarget(target)) {
        clearCardSelection();
        return;
      }
      const audio = useAudioStore.getState();
      audio.resumeMusic();
      audio.playSfx("click", { volume: 0.65 });
    }

    document.addEventListener("pointerdown", unlockMusic, { capture: true, once: true });
    document.addEventListener("keydown", unlockMusic, { capture: true, once: true });
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("pointerdown", unlockMusic, true);
      document.removeEventListener("keydown", unlockMusic, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}

function clearCardSelection() {
  const game = useGameStore.getState();
  game.selectHand(undefined);
  game.selectPlayerCreature(undefined);
  game.selectHordeCreature(undefined);
  game.selectActiveEffectCard(undefined);
  game.setFocusedCardId(undefined);
}

function isValidClickTarget(target: Element) {
  const button = target.closest("button");
  if (button) return !button.hasAttribute("disabled") && button.getAttribute("aria-disabled") !== "true";

  const explicit = target.closest("[data-audio-click='valid']");
  if (explicit) return explicit.getAttribute("aria-disabled") !== "true";

  const control = target.closest("input, select, textarea");
  if (control) return !control.hasAttribute("disabled");

  const roleButton = target.closest("[role='button']");
  if (roleButton) return roleButton.getAttribute("aria-disabled") !== "true";

  return false;
}

function isPreviewReadTarget(target: Element) {
  if (!target.closest("[data-preserve-card-focus='true']")) return false;
  return !target.closest("button, input, select, textarea, [role='button'], [data-audio-click='valid']");
}
