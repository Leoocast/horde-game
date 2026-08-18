export type BoardSessionPolicy = Readonly<{
  id: "normal" | "guided-lesson" | "learn-to-play";
  autosave: boolean;
  showPhaseBanner: boolean;
  showStandardOutcome: boolean;
  showJourneyDefeat: boolean;
  showFutureControls: boolean;
  restrictedSettings: boolean;
  guidedSystemControls: boolean;
  showGuidedInterruption: boolean;
  hostStartDelayMs: number;
  leaveCopy: "game" | "lesson" | "journey";
}>;

export const NORMAL_BOARD_SESSION: BoardSessionPolicy = Object.freeze({
  id: "normal",
  autosave: true,
  showPhaseBanner: true,
  showStandardOutcome: true,
  showJourneyDefeat: false,
  showFutureControls: true,
  restrictedSettings: false,
  guidedSystemControls: false,
  showGuidedInterruption: false,
  hostStartDelayMs: 0,
  leaveCopy: "game",
});

export const GUIDED_LESSON_BOARD_SESSION: BoardSessionPolicy = Object.freeze({
  id: "guided-lesson",
  autosave: false,
  showPhaseBanner: false,
  showStandardOutcome: false,
  showJourneyDefeat: false,
  showFutureControls: false,
  restrictedSettings: true,
  guidedSystemControls: true,
  showGuidedInterruption: true,
  hostStartDelayMs: 0,
  leaveCopy: "lesson",
});

export const LEARN_TO_PLAY_BOARD_SESSION: BoardSessionPolicy = Object.freeze({
  id: "learn-to-play",
  autosave: false,
  showPhaseBanner: true,
  showStandardOutcome: false,
  showJourneyDefeat: true,
  showFutureControls: false,
  restrictedSettings: true,
  guidedSystemControls: true,
  showGuidedInterruption: false,
  hostStartDelayMs: 550,
  leaveCopy: "journey",
});
