import { contentCatalog } from "../content/bootstrap";
import { useGameStore } from "../store/useGameStore";
import { APP_VERSION } from "../version";
import type { StoredJsonCandidates } from "../platform/desktopBridge";
import { isSafeResumeCheckpoint } from "./resumeCheckpoint";
import {
  createResumeSave,
  parseResumeSave,
  type ResumeSaveEnvelope,
} from "./resumeSave";

export type DesktopResumeLoad = Readonly<{
  status: "none" | "available" | "recovered" | "corrupt";
  save?: ResumeSaveEnvelope;
}>;

export async function loadDesktopResume(): Promise<DesktopResumeLoad> {
  const bridge = window.hostfallDesktop;
  if (!bridge) return { status: "none" };
  const candidates = await bridge.readResumeSave();
  return selectDesktopResume(candidates);
}

export function selectDesktopResume(candidates: StoredJsonCandidates): DesktopResumeLoad {
  const primary = parseResumeSave(candidates.primary);
  if (primary.ok) return { status: "available", save: primary.save };
  const backup = parseResumeSave(candidates.backup);
  if (backup.ok) return { status: "recovered", save: backup.save };
  const hasCandidate = candidates.primary !== undefined || candidates.backup !== undefined;
  return Object.freeze({
    status: hasCandidate || candidates.primaryCorrupted || candidates.backupCorrupted ? "corrupt" : "none",
  });
}

export function deleteDesktopResume(): Promise<void> {
  return window.hostfallDesktop?.deleteResumeSave() ?? Promise.resolve();
}

export function startDesktopResumeCheckpointing(options: Readonly<{
  setupTurns: number;
  playerName: string;
}>): () => void {
  const bridge = window.hostfallDesktop;
  if (!bridge) return () => undefined;
  let timer: number | undefined;
  let winnerCleared = false;

  const capture = () => {
    const state = useGameStore.getState();
    if (state.game.winner) {
      if (!winnerCleared) {
        winnerCleared = true;
        void bridge.deleteResumeSave().catch(() => undefined);
      }
      return;
    }
    if (!isSafeResumeCheckpoint(state)) return;
    const save = createResumeSave(state.game, {
      appVersion: APP_VERSION,
      playerDeckId: state.playerDeckId,
      hostDeckId: state.hostDeckId,
      setupTurns: options.setupTurns,
      playerName: options.playerName,
    });
    void bridge.writeResumeSave(save).catch(() => undefined);
  };

  const scheduleCapture = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      capture();
    }, 220);
  };
  const unsubscribe = useGameStore.subscribe(scheduleCapture);
  scheduleCapture();
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    unsubscribe();
  };
}

export function resumeDeckIds(save: ResumeSaveEnvelope): Readonly<{ playerDeckId: string; hostDeckId: string }> {
  return Object.freeze({
    playerDeckId: contentCatalog.requireDeck(save.playerDeckKey, "player").deck.id,
    hostDeckId: contentCatalog.requireDeck(save.hostDeckKey, "host").deck.id,
  });
}
