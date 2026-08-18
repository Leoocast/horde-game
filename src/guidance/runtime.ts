import { GuidedBeatBarrier } from "./beatBarrier";
import { guidedInteractionGate } from "./interactionGate";
import { GuidedPresentationActivityRegistry } from "./presentationActivity";
import { GuidedSessionStore } from "./sessionStore";

export const guidedBeatBarrier = new GuidedBeatBarrier();
export const guidedPresentationActivity = new GuidedPresentationActivityRegistry();
export const guidedSessionStore = new GuidedSessionStore(guidedInteractionGate, guidedBeatBarrier);

export function scheduleGuidedCheckpointEvaluation(check: () => void): void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => check());
    return;
  }
  queueMicrotask(check);
}
