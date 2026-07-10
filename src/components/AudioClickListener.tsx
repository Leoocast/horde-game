import { useEffect } from "react";
import { useAudioStore } from "../store/useAudioStore";

export function AudioClickListener() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-audio-click='off']")) return;
      if (!isValidClickTarget(target)) return;
      const audio = useAudioStore.getState();
      audio.startBattleMusic();
      audio.playSfx("click", { volume: 0.65 });
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
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
