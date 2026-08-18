export type TutorialCalloutWidthProfile = Readonly<{
  minimum: number;
  maximum: number;
  titleCharacterWidth: number;
  chromeWidth: number;
}>;

/** Gives authored titles enough room to remain on one line at their authored desktop size. */
export function tutorialCalloutWidth(
  title: string,
  viewportWidth: number,
  profile: TutorialCalloutWidthProfile,
): number {
  const viewportLimit = Math.max(1, viewportWidth - 32);
  const titleWidth = profile.chromeWidth + title.trim().length * profile.titleCharacterWidth;
  return Math.round(Math.min(viewportLimit, profile.maximum, Math.max(profile.minimum, titleWidth)));
}

/**
 * Keeps the heading on one row when the viewport caps the preferred dialog width. The character
 * metric belongs to the maximum font size; below that width both values scale together.
 */
export function tutorialCalloutTitleFontSize(
  title: string,
  calloutWidth: number,
  profile: TutorialCalloutWidthProfile,
  minimum: number,
  maximum: number,
): number {
  const characters = Math.max(1, title.trim().length);
  const naturalTitleWidth = characters * profile.titleCharacterWidth;
  const availableTitleWidth = Math.max(1, calloutWidth - profile.chromeWidth);
  const fitted = maximum * Math.min(1, availableTitleWidth / naturalTitleWidth);
  return Math.floor(Math.max(minimum, Math.min(maximum, fitted)) * 10) / 10;
}
