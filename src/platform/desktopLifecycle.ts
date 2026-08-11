import { useAudioStore } from "../store/useAudioStore";

/** Mantiene audio y SFX alineados con minimizar, perder foco y suspend/resume del sistema. */
export function registerDesktopLifecycle(): () => void {
  const bridge = window.hostfallDesktop;
  if (bridge) {
    return bridge.onLifecycleChanged((state) => {
      if (state === "background" || state === "suspend") {
        useAudioStore.getState().suspendForLifecycle();
      } else {
        useAudioStore.getState().resumeFromLifecycle();
      }
    });
  }

  const onVisibilityChanged = () => {
    if (document.visibilityState === "hidden") useAudioStore.getState().suspendForLifecycle();
    else useAudioStore.getState().resumeFromLifecycle();
  };
  document.addEventListener("visibilitychange", onVisibilityChanged);
  return () => document.removeEventListener("visibilitychange", onVisibilityChanged);
}
