import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AudioControls } from "../components/AudioControls";
import { Card, CardCostBadge } from "../components/Card";
import { PreviewStatsBadge, TraitPills } from "../components/CardPreview";
import { DeckKeyCard } from "../components/DecksView";
import { DisplayControls } from "../components/DisplayControls";
import { GameLog } from "../components/GameLog";
import { GameTooltip } from "../components/GameTooltip";
import { LanguageSelector } from "../components/LanguageSelector";
import { ToastStack } from "../components/ToastStack";
import { TurnPhaseHud } from "../components/TurnPhaseHud";
import { ZoneDrawer } from "../components/ZoneDrawer";
import { hostInspectableDecks, playerInspectableDecks } from "../data/deckCatalog";
import type { CardInstance } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { useToastStore, type ToastTone } from "../store/useToastStore";
import { cardThemeForDefinition, shouldShowFullCardImage } from "../utils/cardImages";
import { cardStatState, cardTraits } from "../utils/selectors";
import {
  UI_REFERENCE_CATALOG,
  type UiReferenceEntry,
  type UiReferenceStatus,
} from "./uiReferenceCatalog";
import { RuntimeModalGallery } from "./RuntimeModalGallery";
import "./UIReferenceScreen.css";

type Props = {
  onReturnToMenu: () => void;
};

const ELEMENT_FILTERS = [
  "Todos",
  "Botones",
  "Modales",
  "Texto",
  "Controles",
  "Cartas",
  "Navegación",
  "Paneles y HUD",
  "Feedback",
] as const;

type ElementFilter = (typeof ELEMENT_FILTERS)[number];

const BUTTON_ENTRY_IDS: readonly string[] = [
  "ui-primitives",
  "start-menu",
  "app-header",
  "music-player-menu",
  "destiny-copy-identity-button",
  "settings-controls",
  "destiny-rewrite-dialog",
  "phase-controls",
  "game-confirmation-dialog",
];

const TEXT_ENTRY_IDS: readonly string[] = [
  "ui-primitives",
  "loading-screen",
  "error-boundary",
  "card-details",
  "tooltip",
  "game-log",
  "learn-intro",
  "guided-tutorial-dialog",
  "contextual-tutorial-callout",
  "game-outcome-dialog",
  "learn-defeat-outcome-dialog",
  "learn-defeat-narrative-dialog",
];

const CONTROL_ENTRY_IDS: readonly string[] = [
  "settings-controls",
  "music-player-menu",
  "destiny-copy-identity-button",
  "settings-menu-modal",
  "destiny-rewrite-dialog",
  "phase-controls",
  "opening-hand",
  "hand-limit-modal",
  "targeting-overlays",
];

const STATUS_LABELS: Record<UiReferenceStatus, string> = {
  canonical: "Canónico",
  "product-variant": "Variante de producto",
  "context-only": "Revisar en contexto",
};

const TOKEN_SWATCHES = [
  { label: "Canvas", token: "--hf-ui-canvas", value: "#07110f" },
  { label: "Superficie alta", token: "--hf-ui-surface-top", value: "rgb(22 29 30)" },
  { label: "Superficie baja", token: "--hf-ui-surface-bottom", value: "rgb(7 13 15)" },
  { label: "Línea", token: "--hf-ui-line", value: "rgb(183 164 102 / 38%)" },
  { label: "Oro", token: "--hf-ui-gold", value: "#c7aa69" },
  { label: "Oro brillante", token: "--hf-ui-gold-bright", value: "#ead59b" },
  { label: "Texto", token: "--hf-ui-copy", value: "#d9cfaa" },
  { label: "Texto tenue", token: "--hf-ui-copy-muted", value: "#8d9a94" },
] as const;

const TOAST_TONES: readonly ToastTone[] = ["info", "warning", "success", "danger", "host"];

export function UIReferenceScreen({ onReturnToMenu }: Props) {
  const game = useGameStore((state) => state.game);
  const pushToast = useToastStore((state) => state.pushToast);
  const [query, setQuery] = useState("");
  const [elementFilter, setElementFilter] = useState<ElementFilter>("Todos");
  const allCards = useMemo(() => collectRuntimeCards(game), [game]);
  const playerCard = useMemo(
    () => pickCard(allCards, "player", (card) => card.kinds.includes("ECHO")) ?? pickCard(allCards, "player"),
    [allCards],
  );
  const hostCard = useMemo(
    () => pickCard(allCards, "host", (card) => card.kinds.includes("ECHO")) ?? pickCard(allCards, "host"),
    [allCards],
  );
  const costCard = useMemo(
    () => allCards.find((card) => card.owner === "player" && card.energyCost > 0) ?? playerCard,
    [allCards, playerCard],
  );
  const traitCard = useMemo(
    () => allCards.find((card) => cardTraits(game, card).length > 0) ?? playerCard ?? hostCard,
    [allCards, game, hostCard, playerCard],
  );

  const filteredInventory = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return UI_REFERENCE_CATALOG.filter((entry) => {
      if (!matchesElementFilter(entry, elementFilter)) return false;
      if (!needle) return true;
      return [entry.component, entry.source, entry.group, ...entry.usedIn]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [elementFilter, query]);

  const cardStats = playerCard ? cardStatState(game, playerCard).text : "";
  const traitText = traitCard ? cardTraits(game, traitCard) : "";
  const cardTheme = playerCard ? cardThemeForDefinition(playerCard.definitionId) : undefined;

  function showToast(tone: ToastTone) {
    pushToast({
      tone,
      title: `Toast · ${tone}`,
      message: "Componente real montado por ToastStack. Haz clic para descartarlo.",
    });
  }

  return (
    <main className="ui-reference-screen game-screen">
      <header className="ui-reference-topbar">
        <button className="hf-ui-button ui-reference-back" type="button" onClick={onReturnToMenu}>
          <ArrowLeft size={16} />
          <span>Volver</span>
        </button>
        <div className="ui-reference-brand">
          <h1>UI Reference</h1>
        </div>
      </header>

      <div className="ui-reference-layout">
        <aside className="ui-reference-sidebar hf-ui-panel-soft">
          <div className="ui-reference-sidebar-heading">
            <span>Tipos de elemento</span>
            <strong>{UI_REFERENCE_CATALOG.length}</strong>
          </div>
          <label className="ui-reference-search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Buscar componente o uso</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Componente, archivo o uso" />
          </label>
          <nav className="ui-reference-groups" aria-label="Filtrar por tipo de elemento">
            {ELEMENT_FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                className={elementFilter === option ? "is-active" : ""}
                onClick={() => {
                  setElementFilter(option);
                  document.getElementById("ui-reference-inventory")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span>{option}</span>
                <small>{UI_REFERENCE_CATALOG.filter((entry) => matchesElementFilter(entry, option)).length}</small>
              </button>
            ))}
          </nav>
        </aside>

        <div className="ui-reference-content old-scrollbar">
          <ReferenceSection id="foundations" eyebrow="Fundamentos" title="Material, color y acciones compartidas">
            <Specimen entryId="ui-primitives">
              <div className="ui-reference-token-grid">
                {TOKEN_SWATCHES.map((swatch) => (
                  <div key={swatch.token} className="ui-reference-token">
                    <span style={{ "--ui-reference-swatch": `var(${swatch.token})` } as CSSProperties} />
                    <div><strong>{swatch.label}</strong><code>{swatch.token}</code><small>{swatch.value}</small></div>
                  </div>
                ))}
              </div>
              <div className="ui-reference-material-grid">
                <div className="hf-ui-panel ui-reference-material-sample">
                  <span className="ui-reference-kicker">hf-ui-panel</span>
                  <strong className="hf-ui-title">Panel elevado</strong>
                  <p>Carbón frío, línea de oro apagado y esquinas de 2 px.</p>
                </div>
                <div className="hf-ui-panel-soft ui-reference-material-sample">
                  <span className="ui-reference-kicker">hf-ui-panel-soft</span>
                  <strong className="hf-ui-title">Panel secundario</strong>
                  <p>La misma familia material para contenido interior y controles.</p>
                </div>
              </div>
              <div className="ui-reference-actions">
                <button className="hf-ui-button" type="button">Acción secundaria</button>
                <button className="game-dialog-action game-dialog-action-primary" type="button">Acción primaria</button>
                <button className="hf-ui-button" type="button" disabled>Deshabilitada</button>
              </div>
            </Specimen>
          </ReferenceSection>

          <ReferenceSection id="settings" eyebrow="Controles reales" title="Ajustes compartidos">
            <Specimen entryId="settings-controls" notice="Interactivo: cambia las preferencias reales de esta sesión.">
              <div className="ui-reference-settings-grid game-settings-popover">
                <LanguageSelector variant="panel" />
                <AudioControls />
                <DisplayControls />
              </div>
            </Specimen>
          </ReferenceSection>

          <ReferenceSection id="decks" eyebrow="Producto" title="Mazos y cartas">
            <Specimen entryId="deck-key-card">
              <div className="ui-reference-deck-grid">
                {playerInspectableDecks[0] && (
                  <DeckKeyCard
                    deck={playerInspectableDecks[0]}
                    selected
                    actionLabel="Specimen de Crónica seleccionada"
                    onOpen={() => showToast("info")}
                  />
                )}
                {hostInspectableDecks[0] && (
                  <DeckKeyCard
                    deck={hostInspectableDecks[0]}
                    actionLabel="Specimen de Hueste"
                    onOpen={() => showToast("host")}
                  />
                )}
              </div>
            </Specimen>

            <Specimen entryId="card">
              <div className="ui-reference-card-grid">
                {playerCard && <RuntimeCard gameCard={playerCard} game={game} label="Cronista · carta runtime" />}
                {hostCard && <RuntimeCard gameCard={hostCard} game={game} label="Hueste · carta runtime" />}
              </div>
            </Specimen>

            <div className="ui-reference-two-column">
              <Specimen entryId="card-atoms">
                <div className="ui-reference-atom-row">
                  {costCard && <div className="ui-reference-cost-stage"><CardCostBadge card={costCard} /></div>}
                  {cardStats && <PreviewStatsBadge stats={cardStats} cardTheme={cardTheme} />}
                </div>
              </Specimen>
              <Specimen entryId="card-details">
                {traitText
                  ? <TraitPills traits={traitText} cardTheme={traitCard ? cardThemeForDefinition(traitCard.definitionId) : undefined} />
                  : <p className="ui-reference-empty">El estado runtime actual no contiene Rasgos visibles.</p>}
              </Specimen>
            </div>
          </ReferenceSection>

          <ReferenceSection id="hud" eyebrow="Partida" title="HUD y paneles operativos">
            <Specimen entryId="turn-phase-hud">
              <div className="ui-reference-hud-strip"><TurnPhaseHud game={game} setupTurns={3} /></div>
            </Specimen>
            <div className="ui-reference-two-column ui-reference-operational-grid">
              <Specimen entryId="zones"><ZoneDrawer game={game} /></Specimen>
              <Specimen entryId="game-log"><GameLog game={game} className="ui-reference-game-log" /></Specimen>
            </div>
          </ReferenceSection>

          <ReferenceSection id="modals" eyebrow="Runtime · tamaño real" title="Modales y diálogos">
            <RuntimeModalGallery game={game} />
          </ReferenceSection>

          <ReferenceSection id="feedback" eyebrow="Feedback" title="Tooltip y notificaciones">
            <div className="ui-reference-two-column">
              <Specimen entryId="tooltip">
                <div className="ui-reference-tooltip-row">
                  <GameTooltip content="Tooltip real · aparece por hover o foco" side="top">
                    <button className="hf-ui-button" type="button">Tooltip arriba</button>
                  </GameTooltip>
                  <GameTooltip content="Mismo componente, anclado abajo" side="bottom">
                    <button className="hf-ui-button" type="button">Tooltip abajo</button>
                  </GameTooltip>
                </div>
              </Specimen>
              <Specimen entryId="toast-stack">
                <div className="ui-reference-toast-actions">
                  {TOAST_TONES.map((tone) => <button key={tone} className="hf-ui-button" type="button" onClick={() => showToast(tone)}>{tone}</button>)}
                </div>
                <ToastStack variant="game" />
              </Specimen>
            </div>
          </ReferenceSection>

          <ReferenceSection id="inventory" eyebrow="Trazabilidad" title={`Inventario · ${elementFilter} · ${filteredInventory.length}`}>
            <div className="ui-reference-inventory">
              {filteredInventory.map((entry) => <InventoryEntry key={entry.id} entry={entry} />)}
              {filteredInventory.length === 0 && (
                <div className="ui-reference-no-results hf-ui-panel-soft">
                  <Search size={20} />
                  <strong>No hay coincidencias</strong>
                  <span>Prueba con el nombre del componente, su archivo o la pantalla donde se usa.</span>
                </div>
              )}
            </div>
            <footer className="ui-reference-status-guide hf-ui-panel">
              <div className="ui-reference-status-guide-heading">
                <span className="ui-reference-kicker">Cómo leer el inventario</span>
                <h3>Qué significa cada estado</h3>
                <p>El estado describe cómo revisar y reutilizar la pieza; no indica si el componente existe o no.</p>
              </div>
              <dl>
                <div>
                  <StatusBadge status="canonical" />
                  <dt>Canónico</dt>
                  <dd>
                    Es una referencia compartida y reutilizable. La herramienta monta un specimen vivo del
                    componente o la primitiva real; debe ser el punto de partida para nuevas UI equivalentes.
                  </dd>
                </div>
                <div>
                  <StatusBadge status="product-variant" />
                  <dt>Variante de producto</dt>
                  <dd>
                    Es UI runtime válida con una diferencia intencional por pantalla, facción, estado narrativo
                    o función. Comparte la base del sistema, pero no debe convertirse automáticamente en el
                    estilo general de todos los componentes.
                  </dd>
                </div>
                <div>
                  <StatusBadge status="context-only" />
                  <dt>Revisar en contexto</dt>
                  <dd>
                    Es un componente real y alcanzable, pero depende del layout, portales o estado de la partida.
                    Aislarlo aquí sería engañoso, así que se valida en la pantalla indicada en “Dónde se usa”. No
                    significa viejo, retirado ni pendiente de reemplazo.
                  </dd>
                </div>
              </dl>
            </footer>
          </ReferenceSection>
        </div>
      </div>
    </main>
  );
}

function ReferenceSection({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={`ui-reference-${id}`} className="ui-reference-section">
      <header className="ui-reference-section-heading">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </header>
      <div className="ui-reference-section-body">{children}</div>
    </section>
  );
}

function Specimen({ entryId, notice, children }: { entryId: string; notice?: string; children: ReactNode }) {
  const entry = UI_REFERENCE_CATALOG.find((candidate) => candidate.id === entryId);
  if (!entry) return null;
  return (
    <article className="ui-reference-specimen hf-ui-panel-soft">
      <TraceHeader entry={entry} />
      {notice && <p className="ui-reference-notice"><ShieldCheck size={14} /> {notice}</p>}
      <div className="ui-reference-specimen-stage">{children}</div>
    </article>
  );
}

function TraceHeader({ entry }: { entry: UiReferenceEntry }) {
  return (
    <header className="ui-reference-trace">
      <div className="ui-reference-trace-title">
        <StatusBadge status={entry.status} />
        <h3>{entry.component}</h3>
        <code>{entry.source}</code>
      </div>
      <div className="ui-reference-usage">
        <strong>Dónde se usa</strong>
        <ul>{entry.usedIn.map((usage) => <li key={usage}>{usage}</li>)}</ul>
      </div>
    </header>
  );
}

function InventoryEntry({ entry }: { entry: UiReferenceEntry }) {
  return (
    <article className="ui-reference-inventory-entry hf-ui-panel-soft">
      <div className="ui-reference-inventory-heading">
        <StatusBadge status={entry.status} />
        <span>{entry.group}</span>
      </div>
      <h3>{entry.component}</h3>
      <code>{entry.source}</code>
      <div className="ui-reference-inventory-usage">
        <strong>Dónde se usa</strong>
        <ul>{entry.usedIn.map((usage) => <li key={usage}>{usage}</li>)}</ul>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: UiReferenceStatus }) {
  return <span className={`ui-reference-status is-${status}`}>{STATUS_LABELS[status]}</span>;
}

function matchesElementFilter(entry: UiReferenceEntry, filter: ElementFilter) {
  switch (filter) {
    case "Todos":
      return true;
    case "Botones":
      return BUTTON_ENTRY_IDS.includes(entry.id);
    case "Modales":
      return entry.specimen === "modal-gallery" || entry.group === "Resultados";
    case "Texto":
      return TEXT_ENTRY_IDS.includes(entry.id);
    case "Controles":
      return CONTROL_ENTRY_IDS.includes(entry.id);
    case "Cartas":
      return entry.group === "Mazos y cartas" || entry.id.startsWith("graveyard-");
    case "Navegación":
      return entry.group === "Navegación y ajustes" || entry.id === "deck-navigation";
    case "Paneles y HUD":
      return entry.group === "Tablero y HUD" || ["zones", "game-log", "setup-deck-drawer"].includes(entry.id);
    case "Feedback":
      return entry.group === "Overlays y feedback" || entry.group === "Resultados" || entry.id === "guided-support-ui";
  }
}

function RuntimeCard({ gameCard, game, label }: { gameCard: CardInstance; game: ReturnType<typeof useGameStore.getState>["game"]; label: string }) {
  const fullImage = shouldShowFullCardImage(gameCard.definitionId);
  return (
    <figure className="ui-reference-runtime-card">
      <div className="ui-reference-runtime-card-frame">
        <Card
          game={game}
          card={gameCard}
          selectionDisabled
          suppressContextMenu
          suppressHoverOverlay
          highRes
          showFullImage={fullImage}
          preferNativeImageRendering={fullImage}
          showCostBadge
        />
      </div>
      <figcaption><strong>{gameCard.displayName}</strong><span>{label}</span></figcaption>
    </figure>
  );
}

function collectRuntimeCards(game: ReturnType<typeof useGameStore.getState>["game"]): CardInstance[] {
  return [
    ...game.player.hand,
    ...game.player.field,
    ...game.player.archive,
    ...game.player.memory,
    ...game.player.oblivion,
    ...game.host.field,
    ...game.host.archive,
    ...game.host.memory,
    ...game.host.oblivion,
    ...(game.host.pendingCard ? [game.host.pendingCard] : []),
  ];
}

function pickCard(cards: readonly CardInstance[], owner: CardInstance["owner"], predicate: (card: CardInstance) => boolean = () => true) {
  return cards.find((card) => card.owner === owner && predicate(card));
}
