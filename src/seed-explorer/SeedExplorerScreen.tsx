import {
  Activity,
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  Maximize2,
  Play,
  Search,
  Star,
  StickyNote,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../components/Board";
import { ToastStack } from "../components/ToastStack";
import {
  CANON_SEED_DECKS,
  canonSeedPreparationTurns,
  decodeCanonSeed,
} from "../content/CanonSeed";
import { contentCatalog } from "../content/bootstrap";
import { createInitialGame } from "../engine/GameState";
import type { DifficultyMode } from "../engine/GameTypes";
import { writeClipboardText } from "../platform/desktopBridge";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { useCardImage } from "../utils/cardImages";
import {
  ANY_SEED_VARIATION_ID,
  BALANCED_PROFILE_ID,
  EXPERIENCED_PROFILE_ID,
  FIRST_APPROACH_PROFILE_ID,
  HIGH_PRESSURE_PROFILE_ID,
  MULLIGAN_USEFUL_VARIATION_ID,
  PROGRESSIVE_PRESSURE_PROFILE_ID,
  SEED_SEARCH_PROFILES,
  analyzeSeedEntropy,
  classifySeedVariation,
  createSeedAnalysisContext,
  selectDiverseSeedCandidates,
  verifySeedAnalysis,
  type SeedAnalysisResult,
  type SeedCardPreviewV1,
  type SeedSearchProfileId,
  type SeedVariationFilterId,
  type SeedVariationId,
} from "../playground/seedExplorer";
import {
  SeedExplorerRuntime,
  type SeedExplorerRuntimeSnapshot,
} from "../playground/seedExplorerRuntime";
import type { SeedSearchRequest, SeedSearchResult } from "../playground/seedExplorerSearch";
import {
  deleteStoredSeedFavorite,
  listStoredSeedFavorites,
  MAX_SEED_FAVORITE_NOTE_LENGTH,
  saveStoredSeedFavorite,
  seedSearchResultToCsv,
  seedSearchResultToJson,
  updateStoredSeedFavoriteNote,
  type StoredSeedFavorite,
} from "../playground/seedExplorerStorage";
import "./SeedExplorerScreen.css";

const PLAYER_DECK_OPTIONS = CANON_SEED_DECKS
  .filter((entry) => entry.side === "player")
  .map((entry) => ({
    value: entry.qualifiedDeckKey,
    label: contentCatalog.requireDeck(entry.qualifiedDeckKey, "player").deck.name,
  }));

const HOST_DECK_OPTIONS = CANON_SEED_DECKS
  .filter((entry) => entry.side === "host")
  .map((entry) => ({
    value: entry.qualifiedDeckKey,
    label: contentCatalog.requireDeck(entry.qualifiedDeckKey, "host").deck.name,
  }));

const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: DifficultyMode; label: string }> = [
  { value: "easy", label: "Fácil" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Difícil" },
];

const SEARCH_COUNTS = [10_000, 100_000, 500_000] as const;

const SEARCH_PROFILE_OPTIONS: ReadonlyArray<{
  value: SeedSearchProfileId;
  label: string;
  description: string;
}> = [
  {
    value: FIRST_APPROACH_PROFILE_ID,
    label: "Primer acercamiento",
    description: "Prioriza recursos estables, costes accesibles y una Hueste gradual sin aperturas extremas.",
  },
  {
    value: BALANCED_PROFILE_ID,
    label: "Equilibrada",
    description: "Busca un reparto parejo entre apertura, curva, presión y escalada, sin dominar una sola métrica.",
  },
  {
    value: EXPERIENCED_PROFILE_ID,
    label: "Hostfallero experimentado",
    description: "Tolera manos menos cómodas y favorece una Hueste más exigente con mayor escalada.",
  },
  {
    value: HIGH_PRESSURE_PROFILE_ID,
    label: "Presión alta",
    description: "Descarta Hueste pasiva y busca ventanas tempranas intensas, incluso con recursos más ajustados.",
  },
  {
    value: PROGRESSIVE_PRESSURE_PROFILE_ID,
    label: "Escalada progresiva",
    description: "Favorece un comienzo manejable que aumenta claramente su presión durante las ventanas siguientes.",
  },
];

const SEARCH_VARIATION_OPTIONS: ReadonlyArray<{
  value: SeedVariationFilterId;
  label: string;
}> = [
  { value: ANY_SEED_VARIATION_ID, label: "Cualquier variación" },
  { value: MULLIGAN_USEFUL_VARIATION_ID, label: "Mulligan útil" },
  { value: "stable", label: "Más estable" },
  { value: "curve", label: "Mejor curva" },
  { value: "gentle", label: "Inicio suave" },
  { value: "escalation", label: "Mayor escalada" },
  { value: "balanced", label: "Equilibrada" },
];

type ExplorerConfiguration = Readonly<{
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
  profileId: SeedSearchProfileId;
  variationId: SeedVariationFilterId;
  evaluateMulligan: boolean;
  avoidEarlySpikes: boolean;
  count: number;
  top: number;
}>;

type SeedExplorerScreenProps = Readonly<{
  onReturnToMenu: () => void;
}>;

export function SeedExplorerScreen({ onReturnToMenu }: SeedExplorerScreenProps) {
  const loadScenario = useGameStore((state) => state.loadScenario);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const pushToast = useToastStore((state) => state.pushToast);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const stopMusic = useAudioStore((state) => state.stopMusic);
  const [runtime] = useState(() => new SeedExplorerRuntime());
  const [snapshot, setSnapshot] = useState<SeedExplorerRuntimeSnapshot>(() => runtime.snapshot());
  const [configuration, setConfiguration] = useState<ExplorerConfiguration>(() => ({
    playerDeckKey: PLAYER_DECK_OPTIONS[0].value,
    hostDeckKey: HOST_DECK_OPTIONS[0].value,
    difficulty: "normal",
    profileId: FIRST_APPROACH_PROFILE_ID,
    variationId: ANY_SEED_VARIATION_ID,
    evaluateMulligan: true,
    avoidEarlySpikes: true,
    count: 500_000,
    top: 20,
  }));
  const [resultTab, setResultTab] = useState<"finalists" | "favorites">("finalists");
  const [selectionMode, setSelectionMode] = useState<"best" | "diverse">("diverse");
  const [selectedCode, setSelectedCode] = useState<string>();
  const [favorites, setFavorites] = useState<readonly StoredSeedFavorite[]>(() => listStoredSeedFavorites());
  const [boardCandidate, setBoardCandidate] = useState<SeedAnalysisResult>();
  const [finalistDraft, setFinalistDraft] = useState(() => String(configuration.top));
  const [detailsCode, setDetailsCode] = useState<string>();
  const [noteEditorCode, setNoteEditorCode] = useState<string>();
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => () => {
    runtime.cancel();
    stopMusic();
  }, [runtime, stopMusic]);

  useEffect(() => {
    if (runtime.snapshot().status === "running") runtime.cancel();
  }, [
    configuration.playerDeckKey,
    configuration.hostDeckKey,
    configuration.difficulty,
    configuration.profileId,
    configuration.variationId,
    configuration.evaluateMulligan,
    configuration.avoidEarlySpikes,
    configuration.count,
    configuration.top,
    runtime,
  ]);

  useEffect(() => {
    if (boardCandidate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (noteEditorCode) {
        setNoteEditorCode(undefined);
        return;
      }
      if (detailsCode) {
        setDetailsCode(undefined);
        return;
      }
      onReturnToMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [boardCandidate, detailsCode, noteEditorCode, onReturnToMenu]);

  function report(message: string): void {
    pushToast({ title: "Seed Explorer", message, tone: "info" });
  }

  function updateFinalistDraft(value: string): void {
    setFinalistDraft(value);
    if (value.trim() === "") return;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    updateConfiguration({ top: Math.min(100, Math.max(1, parsed)) });
  }

  function commitFinalistDraft(): void {
    const parsed = Number.parseInt(finalistDraft, 10);
    const normalized = Number.isNaN(parsed)
      ? configuration.top
      : Math.min(100, Math.max(1, parsed));
    updateConfiguration({ top: normalized });
    setFinalistDraft(String(normalized));
  }

  function openCandidate(candidate: SeedAnalysisResult): void {
    runtime.cancel();
    const { identity } = candidate;
    const playerDeck = contentCatalog.requireDeck(identity.playerDeckKey, "player").deck;
    const hostDeck = contentCatalog.requireDeck(identity.hostDeckKey, "host").deck;
    loadScenario(
      createInitialGame(
        playerDeck,
        hostDeck,
        identity.entropy,
        identity.preparationTurns,
        identity.difficulty,
        identity.gameMode,
      ),
      { playerDeckId: playerDeck.id, hostDeckId: hostDeck.id },
    );
    startBattleMusic(true);
    setBoardCandidate(candidate);
    pushToast({
      title: "Seed Explorer",
      message: `${identity.canonCode} está lista en el tablero.`,
      tone: "success",
    });
  }

  const savedCandidates = useMemo(() => resolveStoredFavorites(favorites), [favorites]);
  const lastComplete = snapshot.result ?? snapshot.lastCompleteResult;
  const partialCandidates = snapshot.status === "running" || snapshot.status === "cancelled"
    ? snapshot.frame?.partialCandidates ?? []
    : [];
  const rankedCandidatePool = partialCandidates.length > 0
    ? partialCandidates
    : lastComplete?.candidatePool ?? lastComplete?.candidates ?? [];
  const finalistCandidates = selectionMode === "diverse"
    ? selectDiverseSeedCandidates(rankedCandidatePool, configuration.top)
    : rankedCandidatePool.slice(0, configuration.top);
  const visibleCandidates = resultTab === "favorites" ? savedCandidates : finalistCandidates;
  const candidatesByCode = useMemo(
    () => new Map([...rankedCandidatePool, ...savedCandidates].map((candidate) => [candidate.identity.canonCode, candidate])),
    [rankedCandidatePool, savedCandidates],
  );
  const selectedCandidate = selectedCode ? candidatesByCode.get(selectedCode) : undefined;
  const detailsCandidate = detailsCode ? candidatesByCode.get(detailsCode) : undefined;

  useEffect(() => {
    if (visibleCandidates.some((candidate) => candidate.identity.canonCode === selectedCode)) return;
    setSelectedCode(visibleCandidates[0]?.identity.canonCode);
  }, [selectedCode, visibleCandidates]);

  const isRunning = snapshot.status === "running";
  const searchProgress = snapshot.frame?.search;
  const verificationProgress = snapshot.frame?.verification;
  const progress = snapshot.frame?.phase === "verifying"
    ? 1
    : searchProgress && searchProgress.total > 0
      ? searchProgress.examined / searchProgress.total
      : 0;
  const favoriteCodes = useMemo(() => new Set(favorites.map(({ canonCode }) => canonCode)), [favorites]);
  const favoritesByCode = useMemo(() => new Map(favorites.map((favorite) => [favorite.canonCode, favorite])), [favorites]);
  const preparationTurns = canonSeedPreparationTurns(configuration.difficulty);
  const selectedProfile = searchProfileOption(configuration.profileId);

  function updateConfiguration(patch: Partial<ExplorerConfiguration>) {
    setConfiguration((current) => Object.freeze({ ...current, ...patch }));
  }

  function startOrCancelSearch() {
    if (isRunning) {
      runtime.cancel();
      return;
    }
    const request: SeedSearchRequest = {
      playerDeckKey: configuration.playerDeckKey,
      hostDeckKey: configuration.hostDeckKey,
      difficulty: configuration.difficulty,
      profileId: configuration.profileId,
      variationId: configuration.variationId,
      evaluateMulligan: configuration.evaluateMulligan,
      avoidEarlySpikes: configuration.avoidEarlySpikes,
      count: configuration.count,
      top: configuration.top,
    };
    setResultTab("finalists");
    void runtime.start(request, { onSnapshot: setSnapshot }).catch((error) => {
      report(error instanceof Error ? error.message : String(error));
    });
  }

  function toggleFavorite(candidate: SeedAnalysisResult) {
    const exists = favoriteCodes.has(candidate.identity.canonCode);
    if (exists && noteEditorCode === candidate.identity.canonCode) setNoteEditorCode(undefined);
    setFavorites(exists
      ? deleteStoredSeedFavorite(candidate.identity.canonCode)
      : saveStoredSeedFavorite(candidate, {
        profileId: candidate.profileId,
        evaluateMulligan: configuration.evaluateMulligan,
        avoidEarlySpikes: configuration.avoidEarlySpikes,
      }));
  }

  function editFavoriteNote(canonCode: string): void {
    const favorite = favoritesByCode.get(canonCode);
    if (!favorite) return;
    setNoteDraft(favorite.note ?? "");
    setNoteEditorCode(canonCode);
  }

  function saveFavoriteNote(): void {
    if (!noteEditorCode) return;
    setFavorites(updateStoredSeedFavoriteNote(noteEditorCode, noteDraft));
    pushToast({
      title: "Nota guardada",
      message: `La nota quedó vinculada a ${noteEditorCode}.`,
      tone: "success",
    });
    setNoteEditorCode(undefined);
  }

  async function copyCandidate(candidate: SeedAnalysisResult) {
    try {
      await writeClipboardText(candidate.identity.canonCode);
      report(`Canon Seed copiada: ${candidate.identity.canonCode}`);
    } catch {
      report("No se pudo copiar la Canon Seed al portapapeles.");
    }
  }

  function exportResult(format: "json" | "csv") {
    if (!lastComplete) return;
    const contents = format === "json" ? seedSearchResultToJson(lastComplete) : seedSearchResultToCsv(lastComplete);
    downloadText(
      contents,
      `hostfall-seeds-${deckKeySuffix(lastComplete.request.playerDeckKey)}-${deckKeySuffix(lastComplete.request.hostDeckKey)}-${lastComplete.request.profileId}.${format}`,
      format === "json" ? "application/json" : "text/csv",
    );
  }

  const statusMessage = runtimeStatusMessage(snapshot, lastComplete);

  if (boardCandidate) {
    return (
      <div className="seed-explorer-board" aria-label={`Probando ${boardCandidate.identity.canonCode}`}>
        <Board
          key={gameSessionId}
          playerName="Seed Explorer"
          setupTurns={boardCandidate.identity.preparationTurns}
          onReturnToMenu={() => {
            stopMusic();
            setBoardCandidate(undefined);
          }}
        />
      </div>
    );
  }

  return (
    <section
      className="seed-explorer-workspace"
      aria-label="Seed Explorer"
    >
      <header className="seed-explorer-topbar">
        <button className="seed-explorer-button seed-explorer-back" type="button" onClick={onReturnToMenu}>
          <ArrowLeft size={16} />
          <span>Volver</span>
        </button>
        <div className="seed-explorer-brand">
          <span className="seed-explorer-brand-mark" aria-hidden="true"><Activity size={18} /></span>
          <div>
            <h1 className="seed-explorer-title">Seed Explorer <span>/ Laboratorio de futuros</span></h1>
          </div>
        </div>
      </header>

      <main className="seed-explorer-workbench">
        <aside className="seed-explorer-filter-column old-scrollbar" aria-label="Configuración de búsqueda">
          <div className="seed-explorer-section-stack">
            <section className="seed-explorer-group">
              <GroupHeading title="Partida" note="Determinista" />
              <SelectControl
                label="Crónica"
                value={configuration.playerDeckKey}
                options={PLAYER_DECK_OPTIONS}
                onChange={(playerDeckKey) => updateConfiguration({ playerDeckKey })}
              />
              <SelectControl
                label="Hueste"
                value={configuration.hostDeckKey}
                options={HOST_DECK_OPTIONS}
                onChange={(hostDeckKey) => updateConfiguration({ hostDeckKey })}
              />
              <div className="seed-explorer-grid-two">
                <SelectControl
                  label="Dificultad"
                  value={configuration.difficulty}
                  options={DIFFICULTY_OPTIONS}
                  onChange={(difficulty) => updateConfiguration({ difficulty })}
                />
                <div className="seed-explorer-field">
                  <span>Preparación</span>
                  <output className="seed-explorer-readonly-field">{preparationTurns} turnos</output>
                </div>
              </div>
            </section>

            <section className="seed-explorer-group">
              <GroupHeading title="Perfil buscado" note="V1" />
              <SelectControl
                label="Tipo de futuro"
                value={configuration.profileId}
                options={SEARCH_PROFILE_OPTIONS}
                onChange={(profileId) => updateConfiguration({
                  profileId,
                  avoidEarlySpikes: SEED_SEARCH_PROFILES[profileId].defaultAvoidEarlySpikes,
                })}
              />
              <p className="seed-explorer-profile-description">
                {selectedProfile.description}
              </p>
              <VariationSelectControl
                value={configuration.variationId}
                onChange={(variationId) => updateConfiguration({
                  variationId,
                  evaluateMulligan: variationId === MULLIGAN_USEFUL_VARIATION_ID
                    ? true
                    : configuration.evaluateMulligan,
                })}
              />
              <SwitchControl
                label="Evaluar un mulligan"
                checked={configuration.evaluateMulligan}
                onChange={(evaluateMulligan) => updateConfiguration({
                  evaluateMulligan,
                  variationId: !evaluateMulligan && configuration.variationId === MULLIGAN_USEFUL_VARIATION_ID
                    ? ANY_SEED_VARIATION_ID
                    : configuration.variationId,
                })}
              />
              <SwitchControl
                label="Evitar picos tempranos"
                checked={configuration.avoidEarlySpikes}
                onChange={(avoidEarlySpikes) => updateConfiguration({ avoidEarlySpikes })}
              />
            </section>

            <section className="seed-explorer-group">
              <GroupHeading title="Búsqueda" note="Barata" />
              <SelectControl
                label="Cantidad de seeds"
                value={String(configuration.count)}
                options={SEARCH_COUNTS.map((count) => ({ value: String(count), label: formatInteger(count) }))}
                onChange={(count) => updateConfiguration({ count: Number(count) })}
              />
              <label className="seed-explorer-field">
                <span>Finalistas</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={finalistDraft}
                  onChange={(event) => updateFinalistDraft(event.target.value)}
                  onBlur={commitFinalistDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <button
                className={`seed-explorer-button is-primary is-block ${isRunning ? "is-cancelling" : ""}`}
                type="button"
                onClick={startOrCancelSearch}
              >
                {isRunning ? <X size={16} /> : <Search size={16} />}
                <span>{isRunning ? "Cancelar búsqueda" : "Buscar futuros"}</span>
              </button>
              <div className="seed-explorer-search-progress" aria-live="polite">
                <div>
                  <span>{isRunning && snapshot.frame?.phase === "verifying" ? "Verificando finalistas" : isRunning ? "Enumerando futuros" : statusMessage}</span>
                  <span>{isRunning && snapshot.frame?.phase === "verifying" && verificationProgress
                    ? `${formatInteger(verificationProgress.examined)} / ${formatInteger(verificationProgress.total)}`
                    : `${formatInteger(searchProgress?.examined ?? lastComplete?.examined ?? 0)} / ${formatInteger(searchProgress?.total ?? lastComplete?.request.count ?? configuration.count)}`}</span>
                </div>
                <div className="seed-explorer-progress-track">
                  <i
                    className="seed-explorer-progress-fill"
                    style={{
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: ratingColor(progress * 100),
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
        </aside>

        <section className="seed-explorer-result-column" aria-label="Futuros encontrados">
          <header className="seed-explorer-results-header">
            <div className="seed-explorer-results-heading">
              <h2>{visibleCandidates.length} futuros {resultTab === "favorites" ? "guardados" : "candidatos"}</h2>
              <p>{resultSummary(snapshot, lastComplete, finalistCandidates.length)}</p>
            </div>
            <div className="seed-explorer-result-actions">
              <button className="seed-explorer-button" type="button" disabled={!lastComplete} onClick={() => exportResult("json")}>
                <Download size={15} /><span>JSON</span>
              </button>
              <button className="seed-explorer-button" type="button" disabled={!lastComplete} onClick={() => exportResult("csv")}>
                <FileSpreadsheet size={15} /><span>CSV</span>
              </button>
            </div>
          </header>
          <nav className="seed-explorer-tabs" aria-label="Resultados">
            <div className="seed-explorer-result-tabs">
              <button
                className={`seed-explorer-tab ${resultTab === "finalists" ? "is-active" : ""}`}
                type="button"
                onClick={() => setResultTab("finalists")}
              >
                Finalistas
              </button>
              <button
                className={`seed-explorer-tab ${resultTab === "favorites" ? "is-active" : ""}`}
                type="button"
                onClick={() => setResultTab("favorites")}
              >
                Guardadas <span>{favorites.length}</span>
              </button>
            </div>
            {resultTab === "finalists" && (
              <div className="seed-explorer-selection-mode" role="group" aria-label="Selección de finalistas">
                <span>Selección</span>
                <button className={selectionMode === "best" ? "is-active" : ""} type="button" onClick={() => setSelectionMode("best")}>Mejores</button>
                <button className={selectionMode === "diverse" ? "is-active" : ""} type="button" onClick={() => setSelectionMode("diverse")}>Variadas</button>
              </div>
            )}
          </nav>
          <div className="seed-explorer-list old-scrollbar">
            {visibleCandidates.length === 0 ? (
              <div className="seed-explorer-empty">
                {resultTab === "favorites"
                  ? "Todavía no guardaste ningún futuro."
                  : "Configura la búsqueda y enumera futuros para ver candidatas."}
              </div>
            ) : visibleCandidates.map((candidate, index) => (
              <CandidateRow
                key={candidate.identity.canonCode}
                candidate={candidate}
                rank={index + 1}
                active={candidate.identity.canonCode === selectedCandidate?.identity.canonCode}
                favorite={favoriteCodes.has(candidate.identity.canonCode)}
                variationId={classifySeedVariation(candidate)}
                onSelect={() => setSelectedCode(candidate.identity.canonCode)}
              />
            ))}
          </div>
        </section>

        <aside className="seed-explorer-inspector-column old-scrollbar" aria-label="Inspección de seed">
          {selectedCandidate ? (
            <CandidateInspector
              candidate={selectedCandidate}
              favorite={favoriteCodes.has(selectedCandidate.identity.canonCode)}
              favoriteNote={favoritesByCode.get(selectedCandidate.identity.canonCode)?.note}
              onToggleFavorite={() => toggleFavorite(selectedCandidate)}
              onEditNote={() => editFavoriteNote(selectedCandidate.identity.canonCode)}
              onCopy={() => void copyCandidate(selectedCandidate)}
              onTry={() => openCandidate(selectedCandidate)}
              onViewDetails={() => setDetailsCode(selectedCandidate.identity.canonCode)}
            />
          ) : (
            <div className="seed-explorer-empty is-inspector">Selecciona una candidata para inspeccionar su futuro.</div>
          )}
        </aside>
      </main>

      <footer className="seed-explorer-statusbar">
        <span><strong>{statusMessage}</strong> · análisis estático · sin solver</span>
        <span>RNG determinista · ruleset actual · herramienta dev-only</span>
      </footer>
      {detailsCandidate && (
        <SeedDetailsModal
          candidate={detailsCandidate}
          favorite={favoriteCodes.has(detailsCandidate.identity.canonCode)}
          onClose={() => setDetailsCode(undefined)}
          onToggleFavorite={() => toggleFavorite(detailsCandidate)}
          onCopy={() => void copyCandidate(detailsCandidate)}
          onTry={() => openCandidate(detailsCandidate)}
        />
      )}
      {noteEditorCode && (
        <FavoriteNoteModal
          canonCode={noteEditorCode}
          note={noteDraft}
          onChange={setNoteDraft}
          onClose={() => setNoteEditorCode(undefined)}
          onSave={saveFavoriteNote}
        />
      )}
      <ToastStack variant="menu" />
    </section>
  );
}

function CandidateRow({
  candidate,
  rank,
  active,
  favorite,
  variationId,
  onSelect,
}: Readonly<{
  candidate: SeedAnalysisResult;
  rank: number;
  active: boolean;
  favorite: boolean;
  variationId: SeedVariationId;
  onSelect: () => void;
}>) {
  const tags = candidateTags(candidate);
  return (
    <button className={`seed-explorer-result ${active ? "is-active" : ""}`} type="button" onClick={onSelect}>
      <span className="seed-explorer-rank">{String(rank).padStart(2, "0")}</span>
      <span className="seed-explorer-result-copy">
        <span className="seed-explorer-result-code">{candidate.identity.canonCode}{favorite ? " ★" : ""}</span>
        <span className="seed-explorer-result-tags">
          <span className={`seed-explorer-archetype is-${variationTone(variationId)}`}>{variationLabel(variationId)}</span>
          {tags.slice(0, 2).map((tag) => <span className="seed-explorer-tag" key={tag}>{tag}</span>)}
        </span>
      </span>
      <span className="seed-explorer-mini-metrics">
        <MiniMetric label="Recursos" value={candidate.metrics.ratings.resources} />
        <MiniMetric label="Presión" value={candidate.metrics.ratings.pressure} pressure />
      </span>
      <span className="seed-explorer-score">{candidate.score}<small>Ajuste</small></span>
    </button>
  );
}

function CandidateInspector({
  candidate,
  favorite,
  favoriteNote,
  onToggleFavorite,
  onEditNote,
  onCopy,
  onTry,
  onViewDetails,
}: Readonly<{
  candidate: SeedAnalysisResult;
  favorite: boolean;
  favoriteNote?: string;
  onToggleFavorite: () => void;
  onEditNote: () => void;
  onCopy: () => void;
  onTry: () => void;
  onViewDetails: () => void;
}>) {
  const mulligan = candidate.mulligan.recommendation === "mulligan";
  const selectedMetrics = candidate.metrics.selectedHand === "mulligan"
    ? candidate.metrics.mulliganHand ?? candidate.metrics.openingHand
    : candidate.metrics.openingHand;
  const ratings = [
    ["Apertura", candidate.metrics.ratings.opening],
    ["Recursos", candidate.metrics.ratings.resources],
    ["Curva", candidate.metrics.ratings.curve],
    ["Presión", candidate.metrics.ratings.pressure],
    ["Escalada", candidate.metrics.ratings.escalation],
  ] as const;
  return (
    <div className="seed-explorer-inspector">
      <section className="seed-explorer-group">
        <div className="seed-explorer-inspector-head">
          <div>
            <div className="seed-explorer-kicker">{profileLabel(candidate.profileId)}</div>
            <div className="seed-explorer-inspector-code">{candidate.identity.canonCode}</div>
          </div>
          <button
            className={`seed-explorer-favorite ${favorite ? "is-active" : ""}`}
            type="button"
            aria-label={favorite ? "Quitar futuro de guardados" : "Guardar futuro"}
            onClick={onToggleFavorite}
          >
            <Star size={18} fill={favorite ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="seed-explorer-result-tags">
          {candidateTags(candidate).map((tag) => <span className="seed-explorer-tag" key={tag}>{tag}</span>)}
        </div>
        {favoriteNote && <p className="seed-explorer-favorite-note">{favoriteNote}</p>}
        <div className="seed-explorer-metric-grid">
          {ratings.map(([label, value]) => (
            <div className="seed-explorer-metric" key={label}>
              <div><span>{label}</span><strong>{value}</strong></div>
              <div className="seed-explorer-metric-track">
                <i style={{ width: `${value}%`, backgroundColor: ratingColor(value) }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="seed-explorer-group">
        <GroupHeading title="Resumen" note={mulligan ? "Mulligan sugerido" : "Conservar mano"} />
        <dl className="seed-explorer-summary-list">
          <div><dt>Mano inicial</dt><dd>{candidate.preview.openingHand.length} cartas</dd></div>
          <div><dt>Después del mulligan</dt><dd>{candidate.preview.mulliganHand?.length ?? "No evaluado"}</dd></div>
          <div><dt>Fuentes antes de Hueste</dt><dd>{selectedMetrics.sourcesSeenBeforeHost}</dd></div>
          <div><dt>Presión inicial</dt><dd>{candidate.metrics.host.firstWindowPressure}</dd></div>
        </dl>
        <button className="seed-explorer-button is-block" type="button" onClick={onViewDetails}>
          <Maximize2 size={16} />Ver detalles
        </button>
        <p className="seed-explorer-disclaimer">
          Mano inicial, mulligan, robos y ventanas de Hueste se muestran con cartas en la vista amplia.
        </p>
      </section>

      <section className="seed-explorer-group">
        {favorite && (
          <button className="seed-explorer-button seed-explorer-note-button" type="button" onClick={onEditNote}>
            <StickyNote size={15} />{favoriteNote ? "Editar nota" : "Agregar nota"}
          </button>
        )}
        <div className="seed-explorer-inspector-actions">
          <button className="seed-explorer-button" type="button" onClick={onCopy}><Copy size={15} />Copiar seed</button>
          <button className="seed-explorer-button is-primary" type="button" onClick={onTry}><Play size={15} />Probar</button>
        </div>
      </section>
    </div>
  );
}

function FavoriteNoteModal({
  canonCode,
  note,
  onChange,
  onClose,
  onSave,
}: Readonly<{
  canonCode: string;
  note: string;
  onChange: (note: string) => void;
  onClose: () => void;
  onSave: () => void;
}>) {
  return (
    <div className="seed-explorer-note-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="seed-explorer-note-modal" role="dialog" aria-modal="true" aria-labelledby="seed-favorite-note-title" onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}>
        <header>
          <div>
            <span className="seed-explorer-kicker">Futuro guardado</span>
            <h2 id="seed-favorite-note-title">Nota de {canonCode}</h2>
          </div>
          <button className="seed-explorer-detail-close" type="button" aria-label="Cerrar nota" onClick={onClose}><X size={19} /></button>
        </header>
        <label>
          <span>Nota personal</span>
          <textarea
            autoFocus
            value={note}
            maxLength={MAX_SEED_FAVORITE_NOTE_LENGTH}
            placeholder="Por qué funciona esta seed, qué revisar o dónde usarla…"
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <footer>
          <span>{note.length}/{MAX_SEED_FAVORITE_NOTE_LENGTH}</span>
          <div>
            <button className="seed-explorer-button" type="button" onClick={onClose}>Cancelar</button>
            <button className="seed-explorer-button is-primary" type="submit">Guardar nota</button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function GroupHeading({ title, note }: Readonly<{ title: string; note: string }>) {
  return (
    <div className="seed-explorer-group-head">
      <h2 className="seed-explorer-group-title">{title}</h2>
      <span className="seed-explorer-group-note">{note}</span>
    </div>
  );
}

function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}>) {
  return (
    <label className="seed-explorer-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function VariationSelectControl({
  value,
  onChange,
}: Readonly<{
  value: SeedVariationFilterId;
  onChange: (value: SeedVariationFilterId) => void;
}>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = SEARCH_VARIATION_OPTIONS.findIndex((option) => option.value === value);
  const selected = SEARCH_VARIATION_OPTIONS[selectedIndex] ?? SEARCH_VARIATION_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openAndFocusSelected(): void {
    setOpen(true);
    window.requestAnimationFrame(() => optionRefs.current[Math.max(0, selectedIndex)]?.focus());
  }

  function focusOption(index: number): void {
    const bounded = (index + SEARCH_VARIATION_OPTIONS.length) % SEARCH_VARIATION_OPTIONS.length;
    optionRefs.current[bounded]?.focus();
  }

  function choose(next: SeedVariationFilterId): void {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="seed-explorer-field seed-explorer-variation-control" ref={rootRef}>
      <span>Variación buscada</span>
      <button
        ref={triggerRef}
        className="seed-explorer-variation-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => open ? setOpen(false) : openAndFocusSelected()}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          openAndFocusSelected();
        }}
      >
        <VariationDot variationId={selected.value} />
        <span>{selected.label}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="seed-explorer-variation-menu"
          role="listbox"
          aria-label="Variación buscada"
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          {SEARCH_VARIATION_OPTIONS.map((option, index) => (
            <button
              ref={(element) => { optionRefs.current[index] = element; }}
              className={option.value === value ? "is-selected" : ""}
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusOption(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusOption(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusOption(SEARCH_VARIATION_OPTIONS.length - 1);
                }
              }}
            >
              <VariationDot variationId={option.value} />
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VariationDot({ variationId }: Readonly<{ variationId: SeedVariationFilterId }>) {
  return <i className={`seed-explorer-variation-dot is-${variationTone(variationId)}`} aria-hidden="true" />;
}

function SwitchControl({
  label,
  checked,
  onChange,
}: Readonly<{ label: string; checked: boolean; onChange: (checked: boolean) => void }>) {
  return (
    <label className="seed-explorer-switch-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function MiniMetric({ label, value, pressure = false }: Readonly<{ label: string; value: number; pressure?: boolean }>) {
  return (
    <span className={`seed-explorer-mini-line ${pressure ? "is-pressure" : ""}`}>
      <span>{label}</span>
      <span className="seed-explorer-mini-track">
        <i style={{ width: `${value}%`, backgroundColor: ratingColor(value) }} />
      </span>
    </span>
  );
}

function SeedDetailsModal({
  candidate,
  favorite,
  onClose,
  onToggleFavorite,
  onCopy,
  onTry,
}: Readonly<{
  candidate: SeedAnalysisResult;
  favorite: boolean;
  onClose: () => void;
  onToggleFavorite: () => void;
  onCopy: () => void;
  onTry: () => void;
}>) {
  const ratings = [
    ["Apertura", candidate.metrics.ratings.opening],
    ["Recursos", candidate.metrics.ratings.resources],
    ["Curva", candidate.metrics.ratings.curve],
    ["Presión", candidate.metrics.ratings.pressure],
    ["Escalada", candidate.metrics.ratings.escalation],
  ] as const;
  const recommendsMulligan = candidate.mulligan.recommendation === "mulligan";
  return (
    <div className="seed-explorer-detail-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="seed-explorer-detail-modal" role="dialog" aria-modal="true" aria-labelledby="seed-explorer-detail-title">
        <header className="seed-explorer-detail-header">
          <div>
            <div className="seed-explorer-kicker">Futuro completo</div>
            <h2 id="seed-explorer-detail-title">{candidate.identity.canonCode}</h2>
            <div className="seed-explorer-result-tags">
              {candidateTags(candidate).map((tag) => <span className="seed-explorer-tag" key={tag}>{tag}</span>)}
            </div>
          </div>
          <div className="seed-explorer-detail-header-actions">
            <button
              className={`seed-explorer-favorite ${favorite ? "is-active" : ""}`}
              type="button"
              aria-label={favorite ? "Quitar futuro de guardados" : "Guardar futuro"}
              onClick={onToggleFavorite}
            >
              <Star size={18} fill={favorite ? "currentColor" : "none"} />
            </button>
            <button className="seed-explorer-detail-close" type="button" aria-label="Cerrar detalles" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="seed-explorer-detail-body old-scrollbar">
          <section className="seed-explorer-detail-overview">
            <div className="seed-explorer-detail-score"><strong>{candidate.score}</strong><span>Ajuste · {profileLabel(candidate.profileId)}</span></div>
            <div className="seed-explorer-metric-grid is-wide">
              {ratings.map(([label, value]) => (
                <div className="seed-explorer-metric" key={label}>
                  <div><span>{label}</span><strong>{value}</strong></div>
                  <div className="seed-explorer-metric-track">
                    <i style={{ width: `${value}%`, backgroundColor: ratingColor(value) }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <CardCollection
            title="Mano inicial"
            note={`${candidate.preview.openingHand.length} cartas${recommendsMulligan ? " · se recomienda cambiarla" : " · recomendada"}`}
            cards={candidate.preview.openingHand}
            highlighted={!recommendsMulligan}
          />

          {candidate.preview.mulliganHand && (
            <CardCollection
              title="Mano tras mulligan"
              note={`${candidate.preview.mulliganHand.length} cartas · ${recommendsMulligan ? "recomendada" : `mejora ${candidate.mulligan.delta}`}`}
              cards={candidate.preview.mulliganHand}
              highlighted={recommendsMulligan}
            />
          )}

          <CardCollection title="Próximos robos" note="Antes de decisiones" cards={candidate.preview.nextPlayerDraws} compact />

          <section className="seed-explorer-detail-section">
            <GroupHeading title="Hueste potencial" note="Primeras 5 ventanas" />
            <div className="seed-explorer-detail-host-windows">
              {candidate.preview.hostWindows.map((window) => (
                <article className="seed-explorer-detail-host-window" key={window.hostTurn}>
                  <header>
                    <strong>Turno {window.hostTurn}</strong>
                    <span>{pressureLabel(window.pressure)} · presión {window.pressure}</span>
                  </header>
                  <div className="seed-explorer-card-gallery is-host">
                    {window.cards.map((card) => <CardVisual card={card} compact key={card.instanceId} />)}
                  </div>
                </article>
              ))}
            </div>
            <p className="seed-explorer-disclaimer">
              <strong>Aproximación:</strong> las ventanas usan orden y presión impresa. Efectos y decisiones pueden alterar el Archivo y los turnos reales.
            </p>
          </section>
        </div>

        <footer className="seed-explorer-detail-footer">
          <button className="seed-explorer-button" type="button" onClick={onCopy}><Copy size={15} />Copiar seed</button>
          <button className="seed-explorer-button is-primary" type="button" onClick={onTry}><Play size={15} />Probar en tablero</button>
        </footer>
      </section>
    </div>
  );
}

function CardCollection({
  title,
  note,
  cards,
  highlighted = false,
  compact = false,
}: Readonly<{
  title: string;
  note: string;
  cards: readonly SeedCardPreviewV1[];
  highlighted?: boolean;
  compact?: boolean;
}>) {
  return (
    <section className={`seed-explorer-detail-section ${highlighted ? "is-highlighted" : ""}`}>
      <GroupHeading title={title} note={note} />
      <div className={`seed-explorer-card-gallery ${compact ? "is-compact" : ""}`}>
        {cards.map((card) => <CardVisual card={card} compact={compact} key={card.instanceId} />)}
      </div>
    </section>
  );
}

function CardVisual({ card, compact = false }: Readonly<{ card: SeedCardPreviewV1; compact?: boolean }>) {
  const imageUrl = useCardImage(card.definitionId);
  const [imageFailed, setImageFailed] = useState(false);
  const source = card.kinds.some((kind) => kind.toLowerCase() === "source");
  return (
    <article className={`seed-explorer-card-visual ${compact ? "is-compact" : ""} ${source ? "is-source" : ""}`} title={cardLabel(card)}>
      <div className="seed-explorer-card-art">
        {imageUrl && !imageFailed
          ? <img src={imageUrl} alt={cardLabel(card)} loading="lazy" draggable={false} onError={() => setImageFailed(true)} />
          : <span>{cardLabel(card).slice(0, 1)}</span>}
      </div>
      <div className="seed-explorer-card-caption">
        <span>{cardLabel(card)}</span>
        {!source && <small>{card.energyCost}</small>}
      </div>
    </article>
  );
}

function resolveStoredFavorites(entries: readonly StoredSeedFavorite[]): readonly SeedAnalysisResult[] {
  const candidates: SeedAnalysisResult[] = [];
  for (const entry of entries) {
    try {
      const identity = decodeCanonSeed(entry.canonCode);
      const context = createSeedAnalysisContext({
        playerDeckKey: identity.playerDeckKey,
        hostDeckKey: identity.hostDeckKey,
        difficulty: identity.difficulty,
        profileId: entry.profileId,
        evaluateMulligan: entry.evaluateMulligan,
        avoidEarlySpikes: entry.avoidEarlySpikes,
      });
      const projected = analyzeSeedEntropy(context, identity.entropy).result;
      candidates.push(verifySeedAnalysis(context, projected));
    } catch {
      // A favorite from an incompatible future format is ignored instead of poisoning the tool.
    }
  }
  return Object.freeze(candidates);
}

function candidateTags(candidate: SeedAnalysisResult): readonly string[] {
  const tags: string[] = [];
  if (candidate.metrics.ratings.resources >= 75) tags.push("Recursos estables");
  if (candidate.metrics.ratings.curve >= 75) tags.push("Curva accesible");
  if (candidate.metrics.host.firstWindowPressure <= 12) tags.push("Inicio contenido");
  if (candidate.metrics.host.escalation > 0) tags.push("Escalada gradual");
  if (candidate.mulligan.recommendation === "mulligan") tags.push("Mulligan sugerido");
  if (tags.length === 0) tags.push("Candidata estructural");
  return Object.freeze(tags.slice(0, 3));
}

function variationLabel(variationId: SeedVariationFilterId): string {
  return SEARCH_VARIATION_OPTIONS.find(({ value }) => value === variationId)?.label ?? "Cualquier variación";
}

function variationTone(variationId: SeedVariationFilterId): string {
  if (variationId === MULLIGAN_USEFUL_VARIATION_ID) return "mulligan";
  return variationId;
}

function resultSummary(
  snapshot: SeedExplorerRuntimeSnapshot,
  result: SeedSearchResult | undefined,
  visibleCount: number,
): string {
  if (snapshot.status === "running" && snapshot.frame) {
    return `${formatInteger(snapshot.frame.search.examined)} examinados · ${formatInteger(snapshot.frame.search.passedFilters)} pasaron filtros · ${visibleCount} visibles`;
  }
  if (!result) return "Sin búsqueda todavía · perfil Primer acercamiento";
  const variation = result.request.variationId === ANY_SEED_VARIATION_ID
    ? ""
    : ` · ${variationLabel(result.request.variationId)}`;
  return `${formatInteger(result.examined)} examinados · ${formatInteger(result.passedFilters)} pasaron filtros · ${profileLabel(result.request.profileId)}${variation}`;
}

function searchProfileOption(profileId: SeedSearchProfileId) {
  const option = SEARCH_PROFILE_OPTIONS.find(({ value }) => value === profileId);
  if (!option) throw new Error(`Perfil de Seed Explorer desconocido: ${profileId}`);
  return option;
}

function profileLabel(profileId: SeedSearchProfileId): string {
  return searchProfileOption(profileId).label;
}

function runtimeStatusMessage(snapshot: SeedExplorerRuntimeSnapshot, result: SeedSearchResult | undefined): string {
  switch (snapshot.status) {
    case "running": return snapshot.frame?.phase === "verifying" ? "Verificando" : "Buscando";
    case "completed": return `${result?.candidates.length ?? 0} finalistas encontradas`;
    case "cancelled": return result ? "Búsqueda cancelada · último resultado conservado" : "Búsqueda cancelada";
    case "failed": return "La búsqueda falló";
    default: return result ? "Último resultado listo" : "Listo";
  }
}

function pressureLabel(pressure: number): string {
  if (pressure <= 8) return "Baja";
  if (pressure <= 15) return "Media";
  if (pressure <= 22) return "Alta";
  return "Extrema";
}

function ratingColor(value: number): string {
  const normalized = Math.max(0, Math.min(100, value));
  const hue = Math.round(4 + normalized * 1.08);
  return `hsl(${hue} 48% 49%)`;
}

function cardLabel(card: SeedCardPreviewV1): string {
  return card.displayNameEs ?? card.name;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}

function deckKeySuffix(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1];
}

function downloadText(contents: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
