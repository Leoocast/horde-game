export const UI_FEATURE_FLAGS = {
  alignHdHandActionSweep: true,
  showPlayerHandActionableGems: false,
  showDynamicHandCardStats: true,
  useLocalExactCardFonts: true,
  useNativeHdHandImageRendering: true,
} as const;

/** Temporary rollout switches for the new SFX pass. Audio Lab reads the manifest directly, so
 * every clip remains available there even when its gameplay integration is disabled here. */
export const AUDIO_FEATURE_FLAGS = {
  defendDie: true,
  defendSurvive: false,
  drawCard: false,
  endTurn: true,
  firstDraw: false,
  lightningBolt: true,
  noEnergyToPlayCard: true,
  play: true,
  rightClickCard: true,
  selectAttacker: true,
  stoneCrash: true,
  surge: true,
  vaelorLinePlay: true,
} as const;

export function audioFeatureEnabled(id: string): boolean {
  return id in AUDIO_FEATURE_FLAGS
    ? AUDIO_FEATURE_FLAGS[id as keyof typeof AUDIO_FEATURE_FLAGS]
    : true;
}
