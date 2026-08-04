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

export function battlefieldArtSourceCssVariables(
  sourceWidth: number,
  sourceHeight: number,
): Record<string, string> {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return {
      "--battlefield-art-source-width": "100%",
      "--battlefield-art-source-height": "100%",
    };
  }

  const viewportAspect = BATTLEFIELD_ART_VIEWPORT.width / BATTLEFIELD_ART_VIEWPORT.height;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect >= viewportAspect) {
    return {
      "--battlefield-art-source-width": `${(sourceAspect / viewportAspect) * 100}%`,
      "--battlefield-art-source-height": "100%",
    };
  }
  return {
    "--battlefield-art-source-width": "100%",
    "--battlefield-art-source-height": `${(viewportAspect / sourceAspect) * 100}%`,
  };
}
