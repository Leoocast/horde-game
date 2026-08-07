export const UI_FEATURE_FLAGS = {
  alignHdHandActionSweep: true,
  showPlayerHandActionableGems: false,
  showDynamicHandCardStats: true,
  useLocalExactCardFonts: true,
  useNativeHdHandImageRendering: true,
} as const;

/** Rollout switches for the retained SFX from the latest review pass. Audio Lab reads the
 * manifest directly, so a disabled gameplay cue remains available there for comparison. */
export const AUDIO_FEATURE_FLAGS = {
  selectAttacker: true,
  stoneCrash: true,
  vaelorLinePlay: true,
} as const;

export function audioFeatureEnabled(id: string): boolean {
  return id in AUDIO_FEATURE_FLAGS
    ? AUDIO_FEATURE_FLAGS[id as keyof typeof AUDIO_FEATURE_FLAGS]
    : true;
}
