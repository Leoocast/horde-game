import { Swords } from "lucide-react";

type Props = {
  playerName: string;
  hordeName: string;
  hordeDeckId: string;
};

export function EncounterTransition({ playerName, hordeName, hordeDeckId }: Props) {
  const tone = hordeDeckId.includes("goblin") ? "goblins" : "undead";

  return (
    <div className={`encounter-transition is-${tone}`} role="status" aria-live="polite" data-audio-click="off">
      <div className="encounter-transition-vignette" />
      <div className="encounter-transition-rift" />
      <div className="encounter-transition-content">
        <p>The chronicle begins</p>
        <div className="encounter-transition-matchup">
          <strong>{playerName}</strong>
          <span className="encounter-transition-versus"><Swords size={34} /><b>VS</b></span>
          <strong>{hordeName}</strong>
        </div>
      </div>
    </div>
  );
}
