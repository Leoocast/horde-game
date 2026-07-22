import { useEffect, useRef, useState } from "react";
import { Crown, GraduationCap, Heart, Skull, Swords, X } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { getTutorialSpotlightZones, getTutorialStepId, isTutorialSeed, type TutorialStepId } from "../engine/Tutorial";
import { useGameStore } from "../store/useGameStore";
import { useTranslation } from "../i18n/useTranslation";

type Copy = { title: string; text: React.ReactNode };

function Term({ children }: { children: React.ReactNode }) {
  return <span className="mx-0.5 inline-flex items-center rounded-md border border-[#f0c46f]/70 bg-[#3a2408]/80 px-1.5 py-0.5 text-[0.95em] font-black text-[#ffe6aa]">{children}</span>;
}

export function TutorialGuide({ game, onReturnToMenu }: { game: GameState; onReturnToMenu: () => void }) {
  const t = useTranslation();
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
          <p className="old-title text-xs font-bold uppercase tracking-[0.28em]">{t("tutorial.guide")}</p>
          <h2 className="old-title mt-2 text-4xl font-black leading-tight">{t("tutorial.welcome")}</h2>

          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-lg border-2 border-[#4ade80]/50 bg-[#122417]/70 p-4 transition hover:border-[#4ade80]/80 hover:brightness-110">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#8ff0a4]">
                <Swords size={18} />
                {t("tutorial.you")}
              </div>
              <p className="mt-1.5 text-sm leading-snug text-[#c9ecd2]">{t("tutorial.youDescription")}</p>
            </div>
            <div className="rounded-lg border-2 border-[#f3bf63]/50 bg-[#301206]/70 p-4 transition hover:border-[#f3bf63]/80 hover:brightness-110">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#ffb27a]">
                <Skull size={18} />
                {t("tutorial.horde")}
              </div>
              <p className="mt-1.5 text-sm leading-snug text-[#f0cba8]">{t("tutorial.hordeDescription")}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/50 bg-[#122417]/70 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#8ff0a4]">
              <Crown size={14} />
              {t("tutorial.winCondition")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f87171]/50 bg-[#2b0e0e]/70 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#ffb0b0]">
              <Heart size={14} />
              {t("tutorial.loseCondition")}
            </span>
          </div>

          <p className="mt-4 text-sm leading-snug text-[#d6b879]">{t("tutorial.dragHint")}</p>

          <button
            className="old-button-green mt-5 flex h-12 w-full items-center justify-center text-sm font-black uppercase tracking-wide"
            type="button"
            onClick={() => setWelcomeDismissed(true)}
          >
            {t("tutorial.gotIt")}
          </button>
        </div>
      </div>
    );
  }

  const stepId = getTutorialStepId(game);

  if (stepId === "done") {
    return (
      <Panel onReturnToMenu={onReturnToMenu} title={t("tutorial.basicsTitle")} text={t("tutorial.basicsText")}>
        <button className="old-button mt-3 flex h-10 w-full items-center justify-center text-sm font-black uppercase tracking-wide" type="button" onClick={() => setClosed(true)}>
          {t("common.close")}
        </button>
      </Panel>
    );
  }

  const acknowledged = tutorialAcknowledgedStepId === stepId;
  const isFirstTurn = game.turnNumber === 1;
  const isLastMinion = game.horde.battlefield.length === 1;

  if (!acknowledged) {
    const intro = getIntroCopy(stepId, isFirstTurn, isLastMinion, libraryBeforeAttackRef.current - game.horde.library.length, lifeBeforeAttackRef.current - game.player.life, t);
    return (
      <Panel onReturnToMenu={onReturnToMenu} title={intro.title} text={intro.text}>
        <button
          className="old-button-green mt-3 flex h-10 w-full items-center justify-center text-sm font-black uppercase tracking-wide"
          type="button"
          onClick={() => acknowledgeTutorialStep(stepId)}
        >
          {t("tutorial.continue")}
        </button>
      </Panel>
    );
  }

  const zones = getTutorialSpotlightZones(game, stepId, true);
  const action = getActionCopy(stepId, isFirstTurn, t);

  return (
    <>
      {zones.length > 0 && <div className="counter-target-backdrop" data-audio-click="off" />}
      <Panel onReturnToMenu={onReturnToMenu} title={action.title} text={action.text} />
    </>
  );
}

function getIntroCopy(stepId: TutorialStepId, isFirstTurn: boolean, isLastMinion: boolean, milled: number, damageTaken: number, t: ReturnType<typeof useTranslation>): Copy {
  if (stepId === "advance_phase") {
    return isFirstTurn
      ? { title: t("tutorial.mainDone"), text: t("tutorial.mainDoneText") }
      : { title: t("tutorial.yourTurnAgain"), text: t("tutorial.yourTurnAgainText") };
  }
  if (stepId === "end_turn") {
    if (milled > 0) {
      return {
        title: t("tutorial.attackResolved"),
        text: (
          <>
            <Term>{t("tutorial.beastKinRanger")}</Term> {t("tutorial.millResolved", { count: milled })}
          </>
        ),
      };
    }
    return { title: t("tutorial.readyEnd"), text: t("tutorial.readyEndText") };
  }
  if (stepId === "defend") {
    if (isLastMinion) {
      return {
        title: t("tutorial.lastMinion"),
        text: t("tutorial.lastMinionText"),
      };
    }
    return { title: t("tutorial.hordeAttacks"), text: t("tutorial.hordeAttacksText") };
  }
  if (stepId === "continue_turn") {
    const text = damageTaken > 0 ? t("tutorial.damageTaken", { damage: damageTaken }) : t("tutorial.noDamage");
    return { title: t("tutorial.attackResolved"), text };
  }
  if (stepId === "play_land") return { title: t("tutorial.readyTitle"), text: t("tutorial.readyText") };
  if (stepId === "cast_creature") return { title: t("tutorial.landInPlay"), text: t("tutorial.summonText") };
  if (stepId === "attack") return { title: t("tutorial.combatPhase"), text: t("tutorial.attackReady") };
  return { title: "", text: "" };
}

function getActionCopy(stepId: TutorialStepId, isFirstTurn: boolean, t: ReturnType<typeof useTranslation>): Copy {
  if (stepId === "advance_phase") {
    return isFirstTurn
      ? { title: t("tutorial.continueTurn"), text: t("tutorial.endTurnButton") }
      : { title: t("tutorial.continueTurn"), text: t("tutorial.enterBattle") };
  }
  if (stepId === "end_turn") {
    return { title: t("tutorial.endYourTurn"), text: t("tutorial.endYourTurnText") };
  }
  if (stepId === "defend") {
    return {
      title: t("tutorial.defend"),
      text: (
        <>
          {t("tutorial.defendBefore")} <Term>{t("tutorial.ichorspitBasilisk")}</Term>, {t("tutorial.defendMiddle")} <Term>{t("tutorial.attackingZombie")}</Term> {t("tutorial.defendAfter")}
        </>
      ),
    };
  }
  if (stepId === "play_land") return { title: t("tutorial.playLand"), text: t("tutorial.playLandText") };
  if (stepId === "cast_creature") return { title: t("tutorial.castCreature"), text: t("tutorial.castCreatureText") };
  if (stepId === "attack") return { title: t("tutorial.attackHorde"), text: t("tutorial.attackHordeText") };
  if (stepId === "continue_turn") return { title: t("tutorial.continue"), text: t("tutorial.continueHorde") };
  return { title: "", text: "" };
}

function Panel({ onReturnToMenu, title, text, children }: { onReturnToMenu: () => void; title: string; text: React.ReactNode; children?: React.ReactNode }) {
  const t = useTranslation();
  return (
    <div className="old-panel fixed left-4 top-[4.5rem] z-[97] w-[min(480px,calc(100vw-32px))] p-6 text-[#f6e6b8]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#d6b879]">
          <GraduationCap size={18} />
          {t("tutorial.guide")}
        </div>
        <button className="text-[#bda574] transition hover:text-[#e6c36f]" type="button" title={t("tutorial.exit")} onClick={onReturnToMenu}>
          <X size={20} />
        </button>
      </div>
      <h3 className="old-title mt-2 text-2xl font-black">{title}</h3>
      <p className="mt-2 text-lg leading-snug text-[#d6b879]">{text}</p>
      {children}
    </div>
  );
}
