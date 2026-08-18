export type TutorialCalloutWidthProfile = Readonly<{
  minimum: number;
  maximum: number;
  titleCharacterWidth: number;
  chromeWidth: number;
}>;

/** Keeps the authored title on one line without making every short tutorial occupy the same width. */
export function tutorialCalloutWidth(
  title: string,
  viewportWidth: number,
  profile: TutorialCalloutWidthProfile,
): number {
  const viewportLimit = Math.max(1, viewportWidth - 32);
  const titleWidth = profile.chromeWidth + title.trim().length * profile.titleCharacterWidth;
  return Math.round(Math.min(viewportLimit, profile.maximum, Math.max(profile.minimum, titleWidth)));
}
