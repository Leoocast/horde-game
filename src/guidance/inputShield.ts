import type { GuidedAnchorKey } from "./anchorRegistry";
import type { GuidedSessionMode } from "./sessionStore";

/** Pure policy used by the DOM capture layer. The semantic store gate remains the final authority. */
export function guidedDomTargetAllowed(
  mode: GuidedSessionMode,
  targetKeys: readonly GuidedAnchorKey[],
  activeKeys: readonly GuidedAnchorKey[],
  overlayControl = false,
): boolean {
  if (overlayControl) return true;
  if (mode !== "act") return false;
  const allowed = new Set(activeKeys);
  return targetKeys.some((key) => allowed.has(key));
}
