export function TutorialDirectionalCueGlyph() {
  return (
    <svg viewBox="0 0 84 168" aria-hidden="true">
      <path
        className="tutorial-directional-arrow-shadow"
        d="M27 114V70H13L42 24 71 70H57V114Z"
      />
      <path
        className="tutorial-directional-arrow-face"
        d="M27 110V67H16L42 28 68 67H57V110Z"
      />
      <path
        className="tutorial-directional-arrow-inset"
        d="M33 103V61H28L42 40 56 61H51V103Z"
      />
      <rect className="tutorial-directional-trail trail-one" x="24" y="121" width="36" height="9" rx="4.5" />
      <rect className="tutorial-directional-trail trail-two" x="29" y="136" width="26" height="8" rx="4" />
      <rect className="tutorial-directional-trail trail-three" x="34" y="150" width="16" height="7" rx="3.5" />
    </svg>
  );
}
