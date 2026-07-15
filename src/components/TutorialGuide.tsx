import { useEffect, useRef, useState } from "react";
import { Crown, GraduationCap, Heart, Skull, Swords, X } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { getTutorialSpotlightZones, getTutorialStepId, isTutorialSeed, type TutorialStepId } from "../engine/Tutorial";
import { useGameStore } from "../store/useGameStore";

type Copy = { title: string; text: React.ReactNode };

const STATIC_INTRO_COPY: Partial<Record<TutorialStepId, Copy>> = {
  play_land: { title: "You're all set!", text: "Everything is ready. You have a Forest in your hand — let's play it as your first land." },
  cast_creature: { title: "Land in play", text: "Now let's summon a creature. You have Llanowar Elves ready in hand." },
  attack: { title: "Combat phase", text: "Beast-Kin Ranger is ready to attack the Horde." },
};

const STATIC_ACTION_COPY: Partial<Record<TutorialStepId, Copy>> = {
  play_land: { title: "Play a land", text: "Drag the Forest onto the battlefield." },
  cast_creature: { title: "Cast a creature", text: "Drag Llanowar Elves onto the battlefield. It costs 1 green mana." },
  attack: { title: "Attack the Horde", text: "Click Beast-Kin Ranger, then confirm with the action button." },
  continue_turn: { title: "Continue", text: "Tap the action button to let the Horde finish its turn." },
};

function Term({ children }: { children: React.ReactNode }) {
  return <span className="mx-0.5 inline-flex items-center rounded-md border border-[#f0c46f]/70 bg-[#3a2408]/80 px-1.5 py-0.5 text-[0.95em] font-black text-[#ffe6aa]">{children}</span>;
}

export function TutorialGuide({ game, onReturnToMenu }: { game: GameState; onReturnToMenu: () => void }) {
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [closed, setClosed] = useState(false);
  const resolvingHordeCombat = useGameStore((state) => state.resolvingHordeCombat);
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const acknowledgeTutorialStep = useGameStore((state) => state.acknowledgeTutorialStep);
  const lifeBeforeAttackRef = useRef(game.player.life);
  const libraryBeforeAttackRef = useRef(game.horde.library.length);

  useEffect(() => {
    if (game.combat.hordeAttackers.length > 0) lifeBeforeAttackRef.current = game.player.life;
  }, [game.combat.hordeAttackers.length, game.player.life]);

  useEffect(() => {
    if (game.activeSide === "player" && game.phase === "combat") libraryBeforeAttackRef.current = game.horde.library.length;
  }, [game.activeSide, game.phase, game.horde.library.length]);

  if (!isTutorialSeed(game) || closed || game.winner || resolvingHordeCombat) return null;

  if (!welcomeDismissed) {
    return (
      <div className="fixed inset-0 z-[140] flex flex-col items-center justify-center bg-[#090604]/85 p-6">
        <div className="old-panel w-full max-w-xl p-8 text-center">
          <p className="old-title text-xs font-bold uppercase tracking-[0.28em]">Tutorial</p>
          <h2 className="old-title mt-2 text-4xl font-black leading-tight">Welcome</h2>

          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-lg border-2 border-[#4ade80]/50 bg-[#122417]/70 p-4 transition hover:border-[#4ade80]/80 hover:brightness-110">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#8ff0a4]">
                <Swords size={18} />
                You
              </div>
              <p className="mt-1.5 text-sm leading-snug text-[#c9ecd2]">Play lands and creatures, then attack and defend.</p>
            </div>
            <div className="rounded-lg border-2 border-[#f3bf63]/50 bg-[#301206]/70 p-4 transition hover:border-[#f3bf63]/80 hover:brightness-110">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#ffb27a]">
                <Skull size={18} />
                The Horde
              </div>
              <p className="mt-1.5 text-sm leading-snug text-[#f0cba8]">Plays on its own — reveals cards and attacks automatically.</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/50 bg-[#122417]/70 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#8ff0a4]">
              <Crown size={14} />
              Win: Horde runs out of cards
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f87171]/50 bg-[#2b0e0e]/70 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#ffb0b0]">
              <Heart size={14} />
              Lose: your life hits 0
            </span>
          </div>

          <p className="mt-4 text-sm leading-snug text-[#d6b879]">To play a card, drag it upward and release the mouse button.</p>

          <button
            className="old-button-green mt-5 flex h-12 w-full items-center justify-center text-sm font-black uppercase tracking-wide"
            type="button"
            onClick={() => setWelcomeDismissed(true)}
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  const stepId = getTutorialStepId(game);

  if (stepId === "done") {
    return (
      <Panel onReturnToMenu={onReturnToMenu} title="That's the basics!" text="You played a land, cast a creature, attacked, and defended. Keep playing to see how the match ends.">
        <button className="old-button mt-3 flex h-10 w-full items-center justify-center text-sm font-black uppercase tracking-wide" type="button" onClick={() => setClosed(true)}>
          Close
        </button>
      </Panel>
    );
  }

  const acknowledged = tutorialAcknowledgedStepId === stepId;
  const isFirstTurn = game.turnNumber === 1;
  const isLastMinion = game.horde.battlefield.length === 1;

  if (!acknowledged) {
    const intro = getIntroCopy(stepId, isFirstTurn, isLastMinion, libraryBeforeAttackRef.current - game.horde.library.length, lifeBeforeAttackRef.current - game.player.life);
    return (
      <Panel onReturnToMenu={onReturnToMenu} title={intro.title} text={intro.text}>
        <button
          className="old-button-green mt-3 flex h-10 w-full items-center justify-center text-sm font-black uppercase tracking-wide"
          type="button"
          onClick={() => acknowledgeTutorialStep(stepId)}
        >
          Continue
        </button>
      </Panel>
    );
  }

  const zones = getTutorialSpotlightZones(game, stepId, true);
  const action = getActionCopy(stepId, isFirstTurn);

  return (
    <>
      {zones.length > 0 && <div className="counter-target-backdrop" data-audio-click="off" />}
      <Panel onReturnToMenu={onReturnToMenu} title={action.title} text={action.text} />
    </>
  );
}

function getIntroCopy(stepId: TutorialStepId, isFirstTurn: boolean, isLastMinion: boolean, milled: number, damageTaken: number): Copy {
  if (stepId === "advance_phase") {
    return isFirstTurn
      ? { title: "Main phase done", text: "You've played a land and a creature. There's nothing else to do this turn — let's end it." }
      : { title: "Your turn again", text: "Beast-Kin Ranger is untapped. Time to enter Battle phase and attack." };
  }
  if (stepId === "end_turn") {
    if (milled > 0) {
      return {
        title: "Attack resolved",
        text: (
          <>
            <Term>Beast-Kin Ranger</Term> dealt 3 damage to the Horde, milling {milled} card{milled > 1 ? "s" : ""} — every 3 damage mills 1 card. Let's end your turn now.
          </>
        ),
      };
    }
    return { title: "Ready to end your turn", text: "Let's end your turn now." };
  }
  if (stepId === "defend") {
    if (isLastMinion) {
      return {
        title: "Last minion!",
        text: "The Horde has no more cards to play — it only has its last attacker left. Defend and defeat it to win the match!",
      };
    }
    return { title: "The Horde attacks!", text: "The Horde has summoned its minions to attack you. Get ready to defend!" };
  }
  if (stepId === "continue_turn") {
    const text = damageTaken > 0 ? `The Horde's attack got through and dealt you ${damageTaken} damage.` : "You blocked the attack completely — no damage taken!";
    return { title: "Attack resolved", text };
  }
  return STATIC_INTRO_COPY[stepId] ?? { title: "", text: "" };
}

function getActionCopy(stepId: TutorialStepId, isFirstTurn: boolean): Copy {
  if (stepId === "advance_phase") {
    return isFirstTurn
      ? { title: "Continue your turn", text: "Tap the action button to end your turn." }
      : { title: "Continue your turn", text: "Tap the action button to enter Battle phase." };
  }
  if (stepId === "end_turn") {
    return { title: "End your turn", text: "Tap End Turn. The Horde will reveal cards and attack on its own." };
  }
  if (stepId === "defend") {
    return {
      title: "Defend",
      text: (
        <>
          Click <Term>Ichorspit Basilisk</Term>, then click the <Term>attacking zombie</Term> to block it. Confirm with Defend.
        </>
      ),
    };
  }
  return STATIC_ACTION_COPY[stepId] ?? { title: "", text: "" };
}

function Panel({ onReturnToMenu, title, text, children }: { onReturnToMenu: () => void; title: string; text: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="old-panel fixed left-4 top-[4.5rem] z-[97] w-[min(480px,calc(100vw-32px))] p-6 text-[#f6e6b8]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#d6b879]">
          <GraduationCap size={18} />
          Tutorial
        </div>
        <button className="text-[#bda574] transition hover:text-[#e6c36f]" type="button" title="Exit tutorial" onClick={onReturnToMenu}>
          <X size={20} />
        </button>
      </div>
      <h3 className="old-title mt-2 text-2xl font-black">{title}</h3>
      <p className="mt-2 text-lg leading-snug text-[#d6b879]">{text}</p>
      {children}
    </div>
  );
}
