import { ChevronRight, FlaskConical, Home, PanelLeftClose, RotateCcw, Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "../components/Board";
import { MAX_PLAYER_LANDS } from "../engine/GameRules";
import { STORED_MANA_CAP } from "../engine/ManaSystem";
import { useGameStore } from "../store/useGameStore";
import { ActionsPanel } from "./panels/ActionsPanel";
import { CardsPanel } from "./panels/CardsPanel";
import { LibraryPanel } from "./panels/LibraryPanel";
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
  validateScenario,
  type ScenarioCard,
  type ScenarioDefinition,
  type ScenarioZoneKey,
} from "./scenario";

type PlaygroundTab = "scenario" | "cards" | "actions" | "timeline" | "saved";

const TABS: Array<{ id: PlaygroundTab; label: string }> = [
  { id: "scenario", label: "Setup" },
  { id: "cards", label: "Cards" },
  { id: "actions", label: "Actions" },
  { id: "timeline", label: "Flow" },
  { id: "saved", label: "Saved" },
];

type Status = { tone: "idle" | "ok" | "error"; message: string };

/** What is currently on the board. A scenario is a hand-built state; a match is an ordinary game
 *  started the way the main menu starts one. Restart replays whichever one is live, so both stay
 *  reproducible from what launched them. */
type Launch =
  | { kind: "scenario"; definition: ScenarioDefinition }
  | { kind: "match"; definition: ScenarioDefinition; setupTurns: number };

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
  const [matchSetupTurns, setMatchSetupTurns] = useState(3);
  const [dockOpen, setDockOpen] = useState(true);
  const [tab, setTab] = useState<PlaygroundTab>("scenario");
  const [status, setStatus] = useState<Status>({ tone: "idle", message: "No scenario started yet." });
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [recording, setRecording] = useState(true);
  const [replayCursor, setReplayCursor] = useState<number | undefined>();
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [library, setLibrary] = useState<StoredScenario[]>(() => listStoredScenarios());
  const startedRef = useRef(false);

  const startedFrom = launch?.kind === "scenario" ? launch.definition : undefined;
  const boardSetupTurns = launch?.kind === "match" ? launch.setupTurns : 0;

  const start = useCallback(
    (definition: ScenarioDefinition, verb: "started" | "restarted") => {
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
      setLaunch({ kind: "scenario", definition: snapshot });
      setStatus({ tone: "ok", message: `Scenario "${snapshot.name}" ${verb} with seed "${snapshot.seed}".` });
    },
    [loadScenario],
  );

  /** An ordinary game — same call the main menu makes, so opening hand, mulligans and setup turns
   *  all happen for real. The dock stays on top of it. */
  const startMatch = useCallback(
    (definition: ScenarioDefinition, setupTurns: number, verb: "started" | "restarted") => {
      const snapshot = cloneScenario(definition);
      resetGame(
        snapshot.seed,
        setupTurns,
        snapshot.playerDeckId,
        snapshot.hordeDeckId,
        snapshot.difficulty,
        snapshot.gameMode,
      );
      setLaunch({ kind: "match", definition: snapshot, setupTurns });
      setReplayCursor(undefined);
      setAutoPlaying(false);
      setStatus({ tone: "ok", message: `Match ${verb} with seed "${snapshot.seed}" and ${setupTurns} setup turn(s).` });
    },
    [resetGame],
  );

  // A blank scenario on mount: the screen must never show whatever match the store happened to hold.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start(draft, "started");
  }, [draft, start]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2") return;
      event.preventDefault();
      setDockOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function addToScenario(zone: ScenarioZoneKey, entry: ScenarioCard) {
    setDraft((current) => ({
      ...current,
      zones: { ...current.zones, [zone]: [...(current.zones[zone] ?? []), entry] },
    }));
    setStatus({ tone: "ok", message: `${entry.amount ?? 1}× ${entry.definitionId} added to the ${zone} draft. Start to apply.` });
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

  /** Replay always rebuilds first. Both launch kinds are deterministic from their own definition —
   *  a scenario from `buildScenarioGame`, a match from the seed — so the steps land on the same
   *  board they were recorded against either way. */
  function beginReplay(auto: boolean) {
    if (!launch || steps.length === 0) return;
    if (launch.kind === "match") startMatch(launch.definition, launch.setupTurns, "restarted");
    else start(launch.definition, "restarted");
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

  function saveToLibrary() {
    const saved = saveStoredScenario(draft, steps);
    setLibrary(listStoredScenarios());
    setStatus({ tone: "ok", message: `Saved "${saved.name}" with ${steps.length} step(s).` });
  }

  /** Loading brings the flow with the scenario and starts it: a flow without its starting state is
   *  not reproducible, so the two always travel together. */
  function loadFromLibrary(entry: StoredScenario) {
    setDraft(entry.definition);
    setSteps(entry.steps);
    stopReplay();
    start(entry.definition, "started");
  }

  function deleteFromLibrary(id: string) {
    deleteStoredScenario(id);
    setLibrary(listStoredScenarios());
    setStatus({ tone: "ok", message: "Scenario deleted." });
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
      start(entry.definition, "started");
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

          {/* Always visible: launching is the one thing you want without hunting through a tab. */}
          <div className="playground-launch" role="group" aria-label="Launch">
            <button
              className={`playground-launch-button ${launch?.kind === "scenario" ? "is-active" : ""}`}
              type="button"
              title="Build the board from the Setup tab, no opening hand"
              onClick={() => start(draft, "started")}
            >
              <FlaskConical size={14} />
              <span>Scenario</span>
            </button>
            <button
              className={`playground-launch-button ${launch?.kind === "match" ? "is-active" : ""}`}
              type="button"
              title="Start an ordinary game with the seed and decks from the Setup tab"
              onClick={() => startMatch(draft, matchSetupTurns, "started")}
            >
              <Swords size={14} />
              <span>Match</span>
            </button>
            <button
              className="playground-launch-button is-restart"
              type="button"
              disabled={!launch}
              title="Replay whatever is on the board from its own definition"
              onClick={() => {
                if (!launch) return;
                if (launch.kind === "match") startMatch(launch.definition, launch.setupTurns, "restarted");
                else start(launch.definition, "restarted");
              }}
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
                startedFrom={startedFrom}
                dirty={Boolean(startedFrom) && JSON.stringify(draft) !== JSON.stringify(startedFrom)}
                matchSetupTurns={matchSetupTurns}
                onChange={setDraft}
                onChangeMatchSetupTurns={setMatchSetupTurns}
                onStartMatch={() => startMatch(draft, matchSetupTurns, "started")}
              />
            )}
            {tab === "saved" && (
              <LibraryPanel
                entries={library}
                onSave={saveToLibrary}
                onLoad={loadFromLibrary}
                onDelete={deleteFromLibrary}
                onExport={exportEntry}
                onImport={importFile}
              />
            )}
            {tab === "cards" && (
              <CardsPanel
                onAddToScenario={addToScenario}
                onPlaceNow={(zone, entry) => dispatch({ kind: "place", zone, entry })}
              />
            )}
            {tab === "actions" && (
              <ActionsPanel onDispatch={dispatch} onInvalid={(reason) => setStatus({ tone: "error", message: reason })} />
            )}
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
