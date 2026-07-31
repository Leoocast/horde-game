import type { SfxId } from "../audio/soundManifest";

const MONO_GREEN_DECK_ID = "mono_green_ramp";

/** Player-facing buff audio follows the selected player deck. Horde buffs deliberately bypass
 *  this policy so their existing cue never changes with the opposing deck. */
export function playerBuffSfxForDeck(playerDeckId: string): SfxId {
  return playerDeckId === MONO_GREEN_DECK_ID ? "monoGreenBuff" : "buff";
}
