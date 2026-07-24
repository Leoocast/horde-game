import { ChevronRight, FlaskConical, Home, PanelLeftClose, RotateCcw, Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "../components/Board";
import { MAX_PLAYER_LANDS } from "../engine/GameRules";
import { STORED_MANA_CAP } from "../engine/ManaSystem";
import { useGameStore } from "../store/useGameStore";
import { ActionsPanel } from "./panels/ActionsPanel";
import { BoardPanel } from "./panels/BoardPanel";
import { CardsPanel } from "./panels/CardsPanel";
import { ScenarioPanel } from "./panels/ScenarioPanel";
import { TimelinePanel } from "./panels/TimelinePanel";
import { executeStep, isPlaygroundBusy, isWaitingForInput, type TimelineStep } from "./timeline";
import {
  deleteStoredScenario,
  listStoredScenarios,
  parseScenarioFile,
  saveStoredScenario,
  toScenarioFile,
  type StoredScenario,
} from "./scenarioStorage";
import {
  BLANK_SCENARIO,
  buildScenarioGame,
  cloneScenario,
  snapshotScenario,
  validateScenario,
  type ScenarioDefinition,
} from "./scenario";

type PlaygroundTab = "scenario" | "cards" | "board" | "actions" | "timeline";

const TABS: Array<{ id: PlaygroundTab; label: string }> = [
  { id: "scenario", label: "Setup" },
  { id: "cards", label: "Cards" },
  { id: "board", label: "Board" },
  { id: "actions", label: "Actions" },
  { id: "timeline", label: "Flow" },
];

type Status = { tone: "idle" | "ok" | "error"; message: string };

/** What is currently on the board — and the only place launching happens. "Build board" drops you
 *  straight into a hand-made state; "Play game" is an ordinary match, the same call the main menu
 *  makes. Restart replays whichever one is live, so both stay reproducible from what launched them. */
type Launch =
  | { kind: "board"; definition: ScenarioDefinition }
  | { kind: "game"; definition: ScenarioDefinition; setupTurns: number };

const REPLAY_POLL_MS = 120;
const REPLAY_STEP_GAP_MS = 220;

export function PlaygroundScreen({ onReturnToMenu }: { onReturnToMenu: () => void }) {
  const loadScenario = useGameStore((state) => state.loadScenario);
  const resetGame = useGameStore((state) => state.reset);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const [draft, setDraft] = useState<ScenarioDefinition>(() => cloneScenario(BLANK_SCENARIO));
  /** The launch captured when the board was started. Restart rebuilds from THIS, never from the
   *  draft, so editing the form after starting can't silently change what restart reproduces. */
  const [launch, setLaunch] = useState<Launch | undefined>();
  /** Which of the two things this dock is set up for. The Setup tab shows only the fields that
   *  apply: a lab has no difficulty and no deck picker, because nothing in it is a match. */
  const [mode, setMode] = useState<Launch["kind"]>("board");
  const [setupTurns, setSetupTurns] = useState(3);
  const [dockOpen, setDockOpen] = useState(true);
  const [tab, setTab] = useState<PlaygroundTab>("scenario");
  const [status, setStatus] = useState<Status>({ tone: "idle", message: "Nothing launched yet." });
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [recording, setRecording] = useState(true);
  const [replayCursor, setReplayCursor] = useState<number | undefined>();
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [library, setLibrary] = useState<StoredScenario[]>(() => listStoredScenarios());
  const startedRef = useRef(false);

  const startedFrom = launch?.kind === "board" ? launch.definition : undefined;
  const boardSetupTurns = launch?.kind === "game" ? launch.setupTurns : 0;

  const buildBoard = useCallback(
    (definition: ScenarioDefinition, verb: "built" | "rebuilt") => {
      const problems = validateScenario(definition);
      if (problems.length > 0) {
        setStatus({ tone: "error", message: problems.join(" ") });
        return;
      }
      const snapshot = cloneScenario(definition);
      loadScenario(buildScenarioGame(snapshot), {
        playerDeckId: snapshot.playerDeckId,
        hordeDeckId: snapshot.hordeDeckId,
      });
      setLaunch({ kind: "board", definition: snapshot });
      setMode("board");
      setStatus({ tone: "ok", message: `Lab board "${snapshot.name}" ${verb}.` });
    },
    [loadScenario],
  );

  /** An ordinary game — the same `reset` the main menu calls, so opening hand, mulligans and setup
   *  turns all happen for real. The dock stays on top of it. */
  const playGame = useCallback(
    (definition: ScenarioDefinition, turns: number, verb: "started" | "restarted") => {
      const snapshot = cloneScenario(definition);
      resetGame(snapshot.seed, turns, snapshot.playerDeckId, snapshot.hordeDeckId, snapshot.difficulty, snapshot.gameMode);
      setLaunch({ kind: "game", definition: snapshot, setupTurns: turns });
      setMode("game");
      setReplayCursor(undefined);
      setAutoPlaying(false);
      setStatus({ tone: "ok", message: `Game ${verb} with seed "${snapshot.seed}" and ${turns} setup turn(s).` });
    },
    [resetGame],
  );

  // A blank board on mount: the screen must never show whatever match the store happened to hold.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    buildBoard(draft, "built");
  }, [draft, buildBoard]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2") return;
      event.preventDefault();
      setDockOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function relaunch(verb: "rebuilt" | "restarted") {
    if (!launch) return;
    if (launch.kind === "game") playGame(launch.definition, launch.setupTurns, "restarted");
    else buildBoard(launch.definition, verb === "restarted" ? "rebuilt" : verb);
  }

  /** Single entry point for every playground action: run it, report it, and record it unless a
   *  replay is driving (otherwise a replay would append copies of the script it is running). */
  function dispatch(step: TimelineStep) {
    const outcome = executeStep(step);
    setStatus(
      outcome.ok
        ? { tone: "ok", message: outcome.message ?? "Done." }
        : { tone: "error", message: outcome.reason ?? "That action is not available right now." },
    );
    if (outcome.ok && recording && replayCursor === undefined) setSteps((current) => [...current, step]);
    return outcome;
  }

  /** Replay always relaunches first. Both launch kinds are deterministic from their own definition —
   *  a board from `buildScenarioGame`, a game from its seed — so the steps land on the same state
   *  they were recorded against either way. */
  function beginReplay(auto: boolean) {
    if (!launch || steps.length === 0) return;
    relaunch("restarted");
    setReplayCursor(0);
    setAutoPlaying(auto);
  }

  function stopReplay() {
    setReplayCursor(undefined);
    setAutoPlaying(false);
  }

  // Replay driver: one step at a time, never while the board is mid-animation, and paused whenever
  // the game is waiting for a human choice (targeting, discard) instead of answering for them.
  useEffect(() => {
    if (replayCursor === undefined || !autoPlaying) return;
    if (replayCursor >= steps.length) {
      setAutoPlaying(false);
      setStatus({ tone: "ok", message: `Replay finished: ${steps.length} step(s).` });
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (isWaitingForInput()) {
        setAutoPlaying(false);
        setStatus({ tone: "idle", message: "Replay paused: the board is waiting for your input." });
        return;
      }
      if (isPlaygroundBusy()) {
        timer = window.setTimeout(tick, REPLAY_POLL_MS);
        return;
      }
      runStepAt(replayCursor);
    };
    let timer = window.setTimeout(tick, REPLAY_STEP_GAP_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoPlaying, replayCursor, steps]);

  function runStepAt(index: number) {
    const step = steps[index];
    if (!step) return;
    const outcome = executeStep(step);
    setStatus(
      outcome.ok
        ? { tone: "ok", message: `Step ${index + 1}/${steps.length}: ${outcome.message ?? "done"}.` }
        : { tone: "error", message: `Step ${index + 1} failed: ${outcome.reason ?? "unavailable"}.` },
    );
    setReplayCursor(index + 1);
  }

  function stepOnce() {
    if (replayCursor === undefined) {
      beginReplay(false);
      return;
    }
    if (replayCursor >= steps.length) {
      setStatus({ tone: "idle", message: "Replay is already at the end." });
      return;
    }
    if (isPlaygroundBusy()) {
      setStatus({ tone: "idle", message: "Still animating — try again in a moment." });
      return;
    }
    runStepAt(replayCursor);
  }

  /** Saves the board that is on screen, not the form. Placing a card used to update a draft the
   *  board knew nothing about, so what you saw and what you saved were two different things. */
  function saveToLibrary() {
    const snapshot = snapshotScenario(useGameStore.getState().game, draft);
    setDraft(snapshot);
    const saved = saveStoredScenario(snapshot, steps);
    setLibrary(listStoredScenarios());
    setStatus({ tone: "ok", message: `Saved "${saved.name}" as it stands, with ${steps.length} step(s).` });
  }

  /** Loading brings the flow with the board and rebuilds it: a flow without its starting state is
   *  not reproducible, so the two always travel together. */
  function loadFromLibrary(entry: StoredScenario) {
    setDraft(entry.definition);
    setSteps(entry.steps);
    stopReplay();
    buildBoard(entry.definition, "built");
  }

  function deleteFromLibrary(id: string) {
    deleteStoredScenario(id);
    setLibrary(listStoredScenarios());
    setStatus({ tone: "ok", message: "Saved board deleted." });
  }

  function exportEntry(entry: StoredScenario) {
    const url = URL.createObjectURL(new Blob([toScenarioFile(entry)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entry.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "scenario"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ tone: "ok", message: `Exported "${entry.name}".` });
  }

  function importFile(file: File) {
    void file.text().then((contents) => {
      const { entry, problems } = parseScenarioFile(contents);
      if (!entry) {
        setStatus({ tone: "error", message: problems.join(" ") });
        return;
      }
      setDraft(entry.definition);
      setSteps(entry.steps);
      stopReplay();
      buildBoard(entry.definition, "built");
      setStatus({ tone: "ok", message: `Imported "${entry.name}" with ${entry.steps.length} step(s).` });
    });
  }

  return (
    <div className={`playground-shell ${dockOpen ? "is-open" : ""}`}>
      {/* The dock is an overlay on a full-size, untouched board. Shrinking the board through a
          transformed wrapper would offset every getBoundingClientRect-driven overlay (combat
          arrows, targeting lines), and insetting its containers would move the battlefield and the
          Horde wave zone — the very layout this screen exists to inspect. */}
      <div className="playground-stage">
        <Board key={gameSessionId} playerName="Playground" setupTurns={boardSetupTurns} onReturnToMenu={onReturnToMenu} />
      </div>

      {dockOpen ? (
        <aside className="playground-dock" aria-label="Playground tools">
          <header className="playground-dock-header">
            <div>
              <div className="playground-dock-kicker">Developer</div>
              <h2 className="playground-dock-title">Playground</h2>
            </div>
            <div className="playground-dock-header-actions">
              <button className="playground-icon-button" type="button" title="Return to menu" onClick={onReturnToMenu}>
                <Home size={15} />
              </button>
              <button className="playground-icon-button" type="button" title="Collapse dock (F2)" onClick={() => setDockOpen(false)}>
                <PanelLeftClose size={15} />
              </button>
            </div>
          </header>

          {/* The only place launching happens, and it is always visible. It used to be duplicated
              inside the Setup tab, which made the two look like different features. */}
          <div className="playground-launch" role="group" aria-label="Launch">
            <button
              className={`playground-launch-button ${launch?.kind === "board" ? "is-active" : ""}`}
              type="button"
              title="Jump straight to the state in Setup: no opening hand, no setup turns"
              onClick={() => buildBoard(draft, "built")}
            >
              <FlaskConical size={14} />
              <span>Build board</span>
            </button>
            <button
              className={`playground-launch-button ${launch?.kind === "game" ? "is-active" : ""}`}
              type="button"
              title="Play an ordinary match with the seed and decks from Setup"
              onClick={() => playGame(draft, setupTurns, "started")}
            >
              <Swords size={14} />
              <span>Play game</span>
            </button>
            <button
              className="playground-launch-button"
              type="button"
              disabled={!launch}
              title="Relaunch whatever is live from its own definition"
              onClick={() => relaunch("restarted")}
            >
              <RotateCcw size={14} />
              <span>Restart</span>
            </button>
          </div>

          <LiveState />

          <nav className="playground-tabs" aria-label="Playground sections">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                className={`playground-tab ${tab === entry.id ? "is-active" : ""}`}
                type="button"
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="playground-dock-body old-scrollbar">
            {tab === "scenario" && (
              <ScenarioPanel
                draft={draft}
                mode={mode}
                startedFrom={startedFrom}
                dirty={Boolean(startedFrom) && JSON.stringify(draft) !== JSON.stringify(startedFrom)}
                setupTurns={setupTurns}
                library={library}
                onChangeMode={setMode}
                onChange={setDraft}
                onChangeSetupTurns={setSetupTurns}
                onSave={saveToLibrary}
                onLoad={loadFromLibrary}
                onDelete={deleteFromLibrary}
                onExport={exportEntry}
                onImport={importFile}
              />
            )}
            {tab === "cards" && <CardsPanel onDispatch={dispatch} />}
            {tab === "board" && (
              <BoardPanel onDispatch={dispatch} onInvalid={(reason) => setStatus({ tone: "error", message: reason })} />
            )}
            {tab === "actions" && <ActionsPanel onDispatch={dispatch} />}
            {tab === "timeline" && (
              <TimelinePanel
                steps={steps}
                recording={recording}
                cursor={replayCursor}
                autoPlaying={autoPlaying}
                canReplay={Boolean(launch) && steps.length > 0}
                onToggleRecording={() => setRecording((current) => !current)}
                onRemoveStep={(index) => setSteps((current) => current.filter((_, position) => position !== index))}
                onClear={() => {
                  setSteps([]);
                  stopReplay();
                }}
                onStepOnce={stepOnce}
                onToggleAuto={() => (autoPlaying ? setAutoPlaying(false) : beginReplay(true))}
                onStopReplay={stopReplay}
              />
            )}
          </div>

          <footer className={`playground-status is-${status.tone}`} role="status">
            {status.message}
          </footer>
        </aside>
      ) : (
        <button className="playground-dock-handle" type="button" title="Open playground dock (F2)" onClick={() => setDockOpen(true)}>
          <ChevronRight size={16} />
          <span>Playground</span>
        </button>
      )}
    </div>
  );
}

/** The board already shows hands, fields, graveyards, life and energy. This covers what it does not:
 *  the engine's own bookkeeping — event queue and the store's in-flight presentation beats. */
function LiveState() {
  const game = useGameStore((state) => state.game);
  const pendingBeats = useGameStore(
    (state) => state.hordeAutoTriggerCount + state.summoningAnimationCount + state.hordeMillAnimationQueue.length,
  );
  const resolvingHordeCombat = useGameStore((state) => state.resolvingHordeCombat);

  const lands = game.player.battlefield.filter((card) => card.cardTypes.includes("Land"));
  const readyEnergy = lands.filter((card) => !card.tapped && !card.activatedThisTurn).length;
  const busy = resolvingHordeCombat || pendingBeats > 0;

  return (
    <>
      <div className="playground-live">
        <Readout label="Turn" value={`${game.turnNumber} · H${game.hordeTurnNumber}`} />
        <Readout label="Phase" value={game.phase} />
        <Readout label="Active" value={game.activeSide} tone={game.activeSide === "horde" ? "horde" : undefined} />
        <Readout label="Life" value={String(game.player.life)} />
        <Readout label="Energy" value={`${readyEnergy}/${lands.length || MAX_PLAYER_LANDS}`} />
        <Readout label="Stored" value={`${game.player.manaPool.colorless}/${STORED_MANA_CAP}`} />
        <Readout label="Horde deck" value={String(game.horde.library.length)} />
        <Readout label="Poison" value={String(game.horde.poisonCounters)} />
        <Readout label="Events" value={String(game.eventQueue.length)} tone={game.eventQueue.length > 0 ? "busy" : undefined} />
        <Readout
          label="Beats"
          value={resolvingHordeCombat ? `${pendingBeats}+combat` : String(pendingBeats)}
          tone={busy ? "busy" : undefined}
        />
      </div>
      {game.winner && <div className="playground-live-winner">Game over — {game.winner} wins</div>}
    </>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: "busy" | "horde" }) {
  return (
    <div className={`playground-readout ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
