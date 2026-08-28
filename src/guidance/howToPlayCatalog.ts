import type { TranslationKey } from "../i18n/translations";

export const PREPARATION_LESSON_ID = "first-seed";
export const LEARN_TO_PLAY_JOURNEY_ID = "learn-to-play";

export type HowToPlayLauncher =
  | Readonly<{ kind: "guided-lesson"; lessonId: string }>
  | Readonly<{ kind: "journey"; journeyId: string }>;

export type HowToPlayCatalogEntry = Readonly<{
  id: string;
  kickerKey: TranslationKey;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  launcher: HowToPlayLauncher;
}>;

/** Product order is deliberate: the natural-play journey is primary; Preparation is supplemental. */
export const HOW_TO_PLAY_CATALOG: readonly HowToPlayCatalogEntry[] = Object.freeze([
  Object.freeze({
    id: LEARN_TO_PLAY_JOURNEY_ID,
    kickerKey: "howToPlay.learnToPlayKicker",
    titleKey: "howToPlay.learnToPlayTitle",
    descriptionKey: "howToPlay.learnToPlayDescription",
    launcher: Object.freeze({ kind: "journey", journeyId: LEARN_TO_PLAY_JOURNEY_ID }),
  }),
  Object.freeze({
    id: PREPARATION_LESSON_ID,
    kickerKey: "howToPlay.preparationKicker",
    titleKey: "howToPlay.preparationTitle",
    descriptionKey: "howToPlay.preparationDescription",
    launcher: Object.freeze({ kind: "guided-lesson", lessonId: PREPARATION_LESSON_ID }),
  }),
]);
