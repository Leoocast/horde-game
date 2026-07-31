import type { SfxId } from "../audio/soundManifest";
import type { BuffAnimationVariant } from "./buffAnimation";

/** The organic cue belongs to the root/branch presentation itself, not to every action made by a
 *  Mono Green deck. Default buffs—including every Vampire buff—retain the original `buff.wav`. */
export function playerBuffSfxForAnimation(variant: BuffAnimationVariant): SfxId {
  return variant === "default" ? "buff" : "monoGreenBuff";
}
