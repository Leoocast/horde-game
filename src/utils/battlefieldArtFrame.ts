export const BATTLEFIELD_ART_VIEWPORT = Object.freeze({ width: 488, height: 434 });

export type BattlefieldArtFrame = {
  zoom: number;
  x: number;
  y: number;
};

export const DEFAULT_BATTLEFIELD_ART_FRAME: BattlefieldArtFrame = Object.freeze({
  zoom: 1,
  x: 0,
  y: 0,
});

export function battlefieldArtCssVariables(
  frame?: Partial<BattlefieldArtFrame>,
): Record<string, string | number> {
  const resolved = { ...DEFAULT_BATTLEFIELD_ART_FRAME, ...frame };
  const referenceWidth = BATTLEFIELD_ART_VIEWPORT.width;
  return {
    "--battlefield-art-zoom": resolved.zoom,
    "--battlefield-art-x": `${(resolved.x / referenceWidth) * 100}cqw`,
    "--battlefield-art-y": `${(resolved.y / referenceWidth) * 100}cqw`,
  };
}
