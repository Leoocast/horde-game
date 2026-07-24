import { ChevronRight, FlaskConical, Home, PanelLeftClose, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "../components/Board";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { ActionsPanel } from "./panels/ActionsPanel";
import { BoardPanel } from "./panels/BoardPanel";
import { CardsPanel } from "./panels/CardsPanel";
import { ScenarioPanel } from "./panels/ScenarioPanel";
import { TimelinePanel } from "./panels/TimelinePanel";
import {
  deleteStoredBoard,
  deleteStoredReplay,
  listStoredBoards,
  listStoredReplays,
  parseBoardFile,
  saveStoredBoard,
  saveStoredReplay,
  toBoardFile,
  type StoredBoard,
  type StoredReplay,
} from "./scenarioStorage";
import {
  BLANK_SCENARIO,
  buildScenarioGame,
  cloneScenario,
  snapshotBoard,
  validateScenario,
  type ScenarioCard,
  type ScenarioDefinition,
} from "./scenario";
import { executeStep, isPlaygroundBusy, isWaitingForInput, type TimelineStep } from "./timeline";

type PlaygroundTab = "scenario" | "cards" | "board" | "actions" | "timeline";

const TABS: Array<{ id: PlaygroundTab; label: string }> = [
  { id: "scenario", label: "Setup" },
  { id: "cards", label: "Cards" },
  { id: "board", label: "Board" },
  { id: "actions", label: "Actions" },
  { id: "timeline", label: "Replay" },
];

const REPLAY_POLL_MS = 120;
const REPLAY_STEP_GAP_MS = 220;

export function PlaygroundScreen({ onReturnToMenu }: { onReturnToMenu: () => void }) {
  const loadScenario = useGameStore((state) => state.loadScenario);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const pushToast = useToastStore((state) => state.pushToast);
  const [draft, setDraft] = useState<ScenarioDefinition>(() => cloneScenario(BLANK_SCENARIO));
  const [launch, setLaunch] = useState<ScenarioDefinition>();
  const [hordeQueue, setHordeQueue] = useState<ScenarioCard[]>([]);
  const [dockOpen, setDockOpen] = useState(true);
  const [tab, setTab] = useState<PlaygroundTab>("scenario");
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [recording, setRecording] = useState(true);
  const [replayCursor, setReplayCursor] = useState<number | undefined>();
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [boards, setBoards] = useState<StoredBoard[]>(() => listStoredBoards());
  const [replays, setReplays] = useState<StoredReplay[]>(() => listStoredReplays());
  const startedRef = useRef(false);

  const reportError = useCallback(
    (message: string) => pushToast({ title: "Playground", message, tone: "warning" }),
    [pushToast],
  );

  const buildBoard = useCallback(
    (definition: ScenarioDefinition) => {
      const problems = validateScenario(definition);
      if (problems.length > 0) {
        reportError(problems.join(" "));
        return;
      }
      const snapshot = cloneScenario(definition);
      loadScenario(buildScenarioGame(snapshot), {
        playerDeckId: snapshot.playerDeckId,
        hordeDeckId: snapshot.hordeDeckId,
      });
      setLaunch(snapshot);
      setReplayCursor(undefined);
      setAutoPlaying(false);
    },
    [loadScenario, reportError],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    buildBoard(draft);
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

  function dispatch(step: TimelineStep) {
    const outcome = executeStep(step);
    if (!outcome.ok) reportError(outcome.reason ?? "That action is not available right now.");
    if (outcome.ok && recording && replayCursor === undefined) setSteps((current) => [...current, step]);
    return outcome;
  }

  function executeHordeTurn() {
    // addScenarioCard puts each card on top, so stage the authored queue backwards.
    for (const entry of [...hordeQueue].reverse()) {
      const outcome = dispatch({ kind: "place", zone: "hordeLibraryTop", entry });
      if (!outcome.ok) return;
    }
    dispatch({ kind: "hordeTurn" });
  }

  function beginReplay(auto: boolean) {
    if (!launch || steps.length === 0) return;
    buildBoard(launch);
    setReplayCursor(0);
    setAutoPlaying(auto);
  }

  function stopReplay() {
    setReplayCursor(undefined);
    setAutoPlaying(false);
  }

  useEffect(() => {
    if (replayCursor === undefined || !autoPlaying) return;
    if (replayCursor >= steps.length) {
      setAutoPlaying(false);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (isWaitingForInput()) {
        setAutoPlaying(false);
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
    if (!outcome.ok) reportError(`Step ${index + 1}: ${outcome.reason ?? "unavailable"}.`);
    setReplayCursor(index + 1);
  }

  function stepOnce() {
    if (replayCursor === undefined) {
      beginReplay(false);
      return;
    }
    if (replayCursor >= steps.length) return;
    if (isPlaygroundBusy()) {
      reportError("The board is still animating.");
      return;
    }
    runStepAt(replayCursor);
  }

  function saveBoard(name: string) {
    const snapshot = snapshotBoard(useGameStore.getState().game, { ...draft, name });
    setDraft(snapshot);
    saveStoredBoard(snapshot);
    setBoards(listStoredBoards());
  }

  function loadBoard(board: StoredBoard) {
    const definition = cloneScenario(board.definition);
    setDraft(definition);
    buildBoard(definition);
  }

  function removeBoard(id: string) {
    deleteStoredBoard(id);
    setBoards(listStoredBoards());
  }

  function exportBoard(board: StoredBoard) {
    const url = URL.createObjectURL(new Blob([toBoardFile(board)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${board.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "board"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importBoard(file: File) {
    void file.text().then((contents) => {
      const { board, problems } = parseBoardFile(contents);
      if (!board) {
        reportError(problems.join(" "));
        return;
      }
      saveStoredBoard(board.definition);
      setBoards(listStoredBoards());
      loadBoard(board);
    });
  }

  function saveReplay(name: string) {
    if (!launch || steps.length === 0) return;
    saveStoredReplay(name, launch, steps);
    setReplays(listStoredReplays());
  }

  function loadReplay(replay: StoredReplay) {
    const definition = cloneScenario(replay.definition);
    setDraft(definition);
    setSteps(structuredClone(replay.steps));
    buildBoard(definition);
  }

  function removeReplay(id: string) {
    deleteStoredReplay(id);
    setReplays(listStoredReplays());
  }

  return (
    <div className={`playground-shell ${dockOpen ? "is-open" : ""}`}>
      <div className="playground-stage">
        <Board key={gameSessionId} playerName="Playground" setupTurns={0} onReturnToMenu={onReturnToMenu} />
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

          <div className="playground-launch" role="group" aria-label="Board controls">
            <button className="playground-launch-button is-active" type="button" onClick={() => buildBoard(draft)}>
              <FlaskConical size={14} />
              <span>Build board</span>
            </button>
            <button className="playground-launch-button" type="button" disabled={!launch} onClick={() => launch && buildBoard(launch)}>
              <RotateCcw size={14} />
              <span>Restart</span>
            </button>
          </div>

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
                queue={hordeQueue}
                onChangeQueue={setHordeQueue}
                onChange={setDraft}
                onUpdate={() => buildBoard(draft)}
                onExecuteHordeTurn={executeHordeTurn}
              />
            )}
            {tab === "cards" && <CardsPanel onDispatch={dispatch} />}
            {tab === "board" && (
              <BoardPanel
                onDispatch={dispatch}
                onInvalid={reportError}
                boards={boards}
                initialName={draft.name}
                onSaveBoard={saveBoard}
                onLoadBoard={loadBoard}
                onExportBoard={exportBoard}
                onImportBoard={importBoard}
                onDeleteBoard={removeBoard}
              />
            )}
            {tab === "actions" && <ActionsPanel onDispatch={dispatch} />}
            {tab === "timeline" && (
              <TimelinePanel
                steps={steps}
                recording={recording}
                cursor={replayCursor}
                autoPlaying={autoPlaying}
                canReplay={Boolean(launch) && steps.length > 0}
                replays={replays}
                onToggleRecording={() => setRecording((current) => !current)}
                onRemoveStep={(index) => setSteps((current) => current.filter((_, position) => position !== index))}
                onClear={() => {
                  setSteps([]);
                  stopReplay();
                }}
                onStepOnce={stepOnce}
                onToggleAuto={() => (autoPlaying ? setAutoPlaying(false) : beginReplay(true))}
                onStopReplay={stopReplay}
                onSaveReplay={saveReplay}
                onLoadReplay={loadReplay}
                onDeleteReplay={removeReplay}
              />
            )}
          </div>
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
