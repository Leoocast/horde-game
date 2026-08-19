import {
  Activity,
  ArrowLeft,
  Copy,
  Download,
  FileSpreadsheet,
  Maximize2,
  Play,
  Search,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { useCardImage } from "../utils/cardImages";
import {
  analyzeSeedEntropy,
  createSeedAnalysisContext,
  selectDiverseSeedCandidates,
  verifySeedAnalysis,
  type SeedAnalysisResult,
  type SeedCardPreviewV1,
} from "../playground/seedExplorer";
import {
  SeedExplorerRuntime,
  type SeedExplorerRuntimeSnapshot,
} from "../playground/seedExplorerRuntime";
import type { SeedSearchRequest, SeedSearchResult } from "../playground/seedExplorerSearch";
import {
  deleteStoredSeedFavorite,
  listStoredSeedFavorites,
  saveStoredSeedFavorite,
  seedSearchResultToCsv,
  seedSearchResultToJson,
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

type ExplorerConfiguration = Readonly<{
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
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
      if (detailsCode) {
        setDetailsCode(undefined);
        return;
      }
      onReturnToMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [boardCandidate, detailsCode, onReturnToMenu]);

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
  const preparationTurns = canonSeedPreparationTurns(configuration.difficulty);

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
    setFavorites(exists
      ? deleteStoredSeedFavorite(candidate.identity.canonCode)
      : saveStoredSeedFavorite(candidate, {
        evaluateMulligan: configuration.evaluateMulligan,
        avoidEarlySpikes: configuration.avoidEarlySpikes,
      }));
  }

  async function copyCandidate(candidate: SeedAnalysisResult) {
    try {
      await navigator.clipboard.writeText(candidate.identity.canonCode);
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
      `hostfall-seeds-${deckKeySuffix(lastComplete.request.playerDeckKey)}-${deckKeySuffix(lastComplete.request.hostDeckKey)}.${format}`,
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
              <div className="seed-explorer-field">
                <span>Tipo de futuro</span>
                <output className="seed-explorer-readonly-field">Primer acercamiento</output>
              </div>
              <p className="seed-explorer-profile-description">
                Favorece <strong>recursos estables</strong>, costes accesibles y presión gradual. Penaliza aperturas extremas.
              </p>
              <SwitchControl
                label="Evaluar un mulligan"
                checked={configuration.evaluateMulligan}
                onChange={(evaluateMulligan) => updateConfiguration({ evaluateMulligan })}
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
                archetype={candidateArchetype(candidate, index, visibleCandidates)}
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
              onToggleFavorite={() => toggleFavorite(selectedCandidate)}
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
      <ToastStack variant="menu" />
    </section>
  );
}

function CandidateRow({
  candidate,
  rank,
  active,
  favorite,
  archetype,
  onSelect,
}: Readonly<{
  candidate: SeedAnalysisResult;
  rank: number;
  active: boolean;
  favorite: boolean;
  archetype: string;
  onSelect: () => void;
}>) {
  const tags = candidateTags(candidate);
  return (
    <button className={`seed-explorer-result ${active ? "is-active" : ""}`} type="button" onClick={onSelect}>
      <span className="seed-explorer-rank">{String(rank).padStart(2, "0")}</span>
      <span className="seed-explorer-result-copy">
        <span className="seed-explorer-result-code">{candidate.identity.canonCode}{favorite ? " ★" : ""}</span>
        <span className="seed-explorer-result-tags">
          <span className={`seed-explorer-archetype is-${archetypeTone(archetype)}`}>{archetype}</span>
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
  onToggleFavorite,
  onCopy,
  onTry,
  onViewDetails,
}: Readonly<{
  candidate: SeedAnalysisResult;
  favorite: boolean;
  onToggleFavorite: () => void;
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
            <div className="seed-explorer-kicker">Futuro seleccionado</div>
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
        <div className="seed-explorer-inspector-actions">
          <button className="seed-explorer-button" type="button" onClick={onCopy}><Copy size={15} />Copiar seed</button>
          <button className="seed-explorer-button is-primary" type="button" onClick={onTry}><Play size={15} />Probar</button>
        </div>
      </section>
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
            <div className="seed-explorer-detail-score"><strong>{candidate.score}</strong><span>Ajuste al perfil</span></div>
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

function candidateArchetype(
  candidate: SeedAnalysisResult,
  index: number,
  pool: readonly SeedAnalysisResult[],
): string {
  if (index === 0) return "Mejor ajuste";
  if (candidate.mulligan.recommendation === "mulligan" && candidate.mulligan.delta >= 3) return "Mulligan útil";
  const ratings = candidate.metrics.ratings;
  const values = [ratings.resources, ratings.curve, ratings.pressure, ratings.escalation];
  if (Math.max(...values) - Math.min(...values) <= 8) return "Equilibrada";
  const averages = {
    resources: averageRating(pool, "resources"),
    curve: averageRating(pool, "curve"),
    pressure: averageRating(pool, "pressure"),
    escalation: averageRating(pool, "escalation"),
  };
  const distinctions = [
    ["Más estable", ratings.resources - averages.resources],
    ["Mejor curva", ratings.curve - averages.curve],
    ["Inicio suave", ratings.pressure - averages.pressure],
    ["Mayor escalada", ratings.escalation - averages.escalation],
  ] as const;
  return [...distinctions].sort((left, right) => right[1] - left[1])[0][0];
}

function archetypeTone(archetype: string): string {
  switch (archetype) {
    case "Mejor ajuste": return "best";
    case "Más estable": return "stable";
    case "Mejor curva": return "curve";
    case "Inicio suave": return "gentle";
    case "Mayor escalada": return "escalation";
    case "Mulligan útil": return "mulligan";
    default: return "balanced";
  }
}

function averageRating(
  candidates: readonly SeedAnalysisResult[],
  key: keyof SeedAnalysisResult["metrics"]["ratings"],
): number {
  if (candidates.length === 0) return 0;
  return candidates.reduce((sum, candidate) => sum + candidate.metrics.ratings[key], 0) / candidates.length;
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
  return `${formatInteger(result.examined)} examinados · ${formatInteger(result.passedFilters)} pasaron filtros · ordenados para Primer acercamiento`;
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
