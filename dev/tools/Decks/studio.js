/*
 * Card Studio: un solo editor para todos los decks.
 *
 * La vista previa es un iframe con el index.html real del deck, así que lo que se ve aquí
 * es literalmente el documento que el exportador fotografía. No hay un segundo renderer
 * que pueda divergir: esta página sólo escribe variables CSS encima y guarda los valores
 * en studio.config.json.
 */
(() => {
    "use strict";

    const CARD_WIDTH = 976;
    const GAME_ART_WIDTH = 488;
    const GAME_ART_HEIGHT = 434;
    const DEFAULT_FRAME = Object.freeze({ zoom: 1, x: 0, y: 0 });
    const MOTIF_SLOTS = [
        { key: "head", label: "Cabecera" },
        { key: "band", label: "Banda de tipo" },
        { key: "stats", label: "Stats" }
    ];

    /* Estilos que sólo existen mientras se edita; el exportador abre su propio documento. */
    const PREVIEW_CSS = `
        .studio-header { display: none !important; }
        html.studio-focus, body.studio-focus { overflow: hidden !important; }
        .cards-grid { padding: 28px 20px 56px; }
        .tcg-card { transition: opacity .12s ease; }
        body.studio-focus .tcg-card { display: none; }
        body.studio-focus .tcg-card.studio-selected { display: block; }
        body.studio-grid .tcg-card:not(.studio-selected) { opacity: .28; }
        body.studio-grid .tcg-card:not(.studio-selected):hover { opacity: .6; }
        .tcg-art-frame { cursor: grab; }
        .tcg-art-frame.is-dragging { cursor: grabbing; }
    `;

    const el = (id) => document.getElementById(id);
    const deckSelect = el("deck-select");
    const languageSelect = el("language-select");
    const cardList = el("card-list");
    const preview = el("preview");
    const artControls = el("art-controls");
    const gameArtSection = el("game-art-section");
    const gameArtSectionLabel = el("game-art-section-label");
    const gameArtControls = el("game-art-controls");
    const gamePreviewPanel = el("game-preview-panel");
    const gamePreviewLabel = el("game-preview-label");
    const gamePreview = el("game-preview");
    const gamePreviewImage = el("game-preview-image");
    const gamePreviewTitle = el("game-preview-title");
    const gamePreviewStats = el("game-preview-stats");
    const motifControls = el("motif-controls");
    const slotPicker = el("slot-picker");
    const artFile = el("art-file");
    const artDrop = el("art-drop");
    const artThumb = el("art-thumb");
    const artFileName = el("art-file-name");
    const fullArtToggle = el("full-art-toggle");
    const headerFadeToggle = el("header-fade-toggle");
    const statusLine = el("status");
    const saveButton = el("save");
    const resetButton = el("reset");
    const reloadButton = el("reload-data");
    const selectedName = el("selected-name");
    const selectedMeta = el("selected-meta");
    const selectedPosition = el("selected-position");
    const selectedId = el("selected-id");
    const copyCardId = el("copy-card-id");
    const cardSearch = el("card-search");
    const cardFilter = el("card-filter");

    /** Ediciones sin guardar, por deck. */
    const pending = new Map();
    /** Revisión local para invalidar imágenes reemplazadas sin modificar sus rutas guardadas. */
    const uploadedArtRevisions = new Map();
    let decks = [];
    let deckId = "";
    let cardId = "";
    let language = "es";
    let motifSlot = "head";
    let viewMode = "focus";
    let scale = 45;
    let listFilter = "all";
    let searchQuery = "";
    let lastRegenerated = [];
    let supportsFullArtOverrides = false;
    let supportsHeaderFadeOverrides = false;
    let supportsBattlefieldArtFrames = false;

    const deck = () => decks.find((entry) => entry.id === deckId) ?? null;
    const localizedCard = (entry) => {
        if (!entry) return null;
        const localized = entry.localizations?.[language]
            ?? entry.localizations?.[deck()?.defaultLanguage]
            ?? {};
        return { ...entry, ...localized };
    };
    const cards = () => (deck()?.cards ?? []).map(localizedCard);
    const card = () => localizedCard(
        deck()?.cards.find((entry) => entry.id === cardId) ?? null
    );

    function versionedArtUrl(url, id, targetDeckId = deckId) {
        if (!url) return url;
        const revision = uploadedArtRevisions.get(`${targetDeckId}:${id}`);
        if (!revision) return url;
        const separator = String(url).includes("?") ? "&" : "?";
        return `${url}${separator}studioArt=${revision}`;
    }

    function markArtUploaded(targetDeckId, id) {
        const key = `${targetDeckId}:${id}`;
        uploadedArtRevisions.set(key, (uploadedArtRevisions.get(key) ?? 0) + 1);
    }

    function draft() {
        if (!pending.has(deckId)) {
            const current = deck();
            pending.set(deckId, {
                artFrames: new Map(
                    (current?.cards ?? []).map((entry) => [entry.id, entry.artFrame ?? null])
                ),
                fullArtOverrides: new Map(
                    (current?.cards ?? []).map(
                        (entry) => [entry.id, entry.fullArtOverride ?? null]
                    )
                ),
                headerFadeOverrides: new Map(
                    (current?.cards ?? []).map(
                        (entry) => [entry.id, entry.headerFadeOverride ?? null]
                    )
                ),
                battlefieldArtFrames: new Map(
                    (current?.cards ?? []).map(
                        (entry) => [entry.id, entry.battlefieldArtFrame ?? null]
                    )
                ),
                motif: structuredClone(current?.motif ?? null)
            });
        }
        return pending.get(deckId);
    }

    const frameOf = (id) => ({ ...DEFAULT_FRAME, ...(draft().artFrames.get(id) ?? {}) });
    const battlefieldFrameOf = (id) => ({
        ...DEFAULT_FRAME,
        ...(draft().battlefieldArtFrames.get(id) ?? {})
    });
    const isAdjusted = (frame) => frame.zoom !== 1 || frame.x !== 0 || frame.y !== 0;

    function fullArtOf(id) {
        const override = draft().fullArtOverrides.get(id);
        if (typeof override === "boolean") return override;
        return Boolean(deck()?.cards.find((entry) => entry.id === id)?.fullArt);
    }

    function headerFadeOf(id) {
        const override = draft().headerFadeOverrides.get(id);
        if (typeof override === "boolean") return override;
        return deck()?.cards.find((entry) => entry.id === id)?.headerFade !== false;
    }

    /* Hay cambios sin guardar si el borrador difiere de lo que hay en disco. */
    function isDirty() {
        const current = deck();
        if (!current || !pending.has(deckId)) return false;
        const local = pending.get(deckId);
        const sameMotif =
            JSON.stringify(local.motif ?? null) === JSON.stringify(current.motif ?? null);
        const sameFrames = current.cards.every(
            (entry) => JSON.stringify(local.artFrames.get(entry.id) ?? null)
                === JSON.stringify(entry.artFrame ?? null)
        );
        const sameFullArt = current.cards.every(
            (entry) => (local.fullArtOverrides.get(entry.id) ?? null)
                === (entry.fullArtOverride ?? null)
        );
        const sameHeaderFade = current.cards.every(
            (entry) => (local.headerFadeOverrides.get(entry.id) ?? null)
                === (entry.headerFadeOverride ?? null)
        );
        const sameBattlefieldFrames = current.cards.every(
            (entry) => JSON.stringify(local.battlefieldArtFrames.get(entry.id) ?? null)
                === JSON.stringify(entry.battlefieldArtFrame ?? null)
        );
        return !(
            sameMotif
            && sameFrames
            && sameFullArt
            && sameHeaderFade
            && sameBattlefieldFrames
        );
    }

    function setFrame(id, frame) {
        draft().artFrames.set(id, isAdjusted(frame) ? frame : null);
        applyFrameToPreview(id);
        renderCardList();
        renderDirty();
    }

    function setBattlefieldFrame(id, frame) {
        if (!supportsBattlefieldArtFrames) return;
        const next = {
            zoom: Math.min(4, Math.max(0.2, Number(frame.zoom))),
            x: Math.min(GAME_ART_WIDTH, Math.max(-GAME_ART_WIDTH, Math.round(frame.x))),
            y: Math.min(GAME_ART_HEIGHT, Math.max(-GAME_ART_HEIGHT, Math.round(frame.y)))
        };
        draft().battlefieldArtFrames.set(id, isAdjusted(next) ? next : null);
        renderGamePreview();
        renderCardList();
        renderDirty();
    }

    function setFullArt(id, enabled) {
        if (!supportsFullArtOverrides) return;
        draft().fullArtOverrides.set(id, Boolean(enabled));
        renderArtControls();
        renderDirty();
        refreshPreviewCards();
    }

    function setHeaderFade(id, enabled) {
        if (!supportsHeaderFadeOverrides || fullArtOf(id)) return;
        draft().headerFadeOverrides.set(id, Boolean(enabled));
        renderArtControls();
        renderDirty();
        refreshPreviewCards();
    }

    function motifOf(slot) {
        const stored = draft().motif?.[slot];
        return {
            x: stored?.x ?? 0,
            y: stored?.y ?? 0,
            zoom: stored?.zoom ?? 1,
            rotation: stored?.rotation ?? 0
        };
    }

    function setMotif(slot, values) {
        const current = draft();
        const next = current.motif ? { ...current.motif } : {};
        if (values.x === 0 && values.y === 0 && values.zoom === 1 && values.rotation === 0) {
            delete next[slot];
        }
        else next[slot] = values;
        current.motif = Object.keys(next).length > 0 ? next : null;
        applyMotifToPreview();
        renderSlotPicker();
        renderDirty();
    }

    function setStatus(message, kind = "") {
        statusLine.textContent = message;
        statusLine.className = kind;
    }

    function renderDirty() {
        saveButton.classList.toggle("is-dirty", isDirty());
    }

    /* ---------------------------------------------------------------- iframe */

    const previewDocument = () => {
        try {
            return preview.contentDocument;
        } catch {
            return null;
        }
    };

    function cardElement(id) {
        const doc = previewDocument();
        return doc?.querySelector(`.tcg-card[data-card-id="${CSS.escape(id)}"]`) ?? null;
    }

    function applyFrameToPreview(id) {
        const image = cardElement(id)?.querySelector(".tcg-art-image");
        if (!image) return;
        const frame = frameOf(id);
        if (isAdjusted(frame)) {
            image.style.setProperty(
                "--art-transform",
                `translate(${frame.x}px, ${frame.y}px) scale(${frame.zoom})`
            );
        } else {
            image.style.removeProperty("--art-transform");
        }
    }

    function clearGameArtSourceSize() {
        gamePreview.style.removeProperty("--game-art-source-width");
        gamePreview.style.removeProperty("--game-art-source-height");
    }

    function applyGameArtSourceSize() {
        const sourceWidth = gamePreviewImage.naturalWidth;
        const sourceHeight = gamePreviewImage.naturalHeight;
        if (!(sourceWidth > 0) || !(sourceHeight > 0)) return;

        const viewportAspect = GAME_ART_WIDTH / GAME_ART_HEIGHT;
        const sourceAspect = sourceWidth / sourceHeight;
        const width = sourceAspect >= viewportAspect
            ? (sourceAspect / viewportAspect) * 100
            : 100;
        const height = sourceAspect >= viewportAspect
            ? 100
            : (viewportAspect / sourceAspect) * 100;
        gamePreview.style.setProperty("--game-art-source-width", `${width}%`);
        gamePreview.style.setProperty("--game-art-source-height", `${height}%`);
    }

    function renderGamePreview() {
        const current = card();
        gamePreviewPanel.hidden = viewMode !== "focus"
            || !current
            || !current.battlefieldArtEligible;
        if (!current) return;

        const battlefieldArtKind = current.battlefieldArtKind || "echo";
        const isSupport = battlefieldArtKind === "support";
        const frame = battlefieldFrameOf(cardId);
        gamePreview.style.setProperty(
            "--game-art-x",
            `${(frame.x / GAME_ART_WIDTH) * 100}cqw`
        );
        gamePreview.style.setProperty(
            "--game-art-y",
            `${(frame.y / GAME_ART_WIDTH) * 100}cqw`
        );
        gamePreview.style.setProperty("--game-art-zoom", frame.zoom);
        gamePreviewPanel.dataset.kind = battlefieldArtKind;
        gamePreview.dataset.deck = deckId;
        gamePreview.dataset.kind = battlefieldArtKind;
        gamePreviewLabel.textContent = isSupport
            ? "Apoyo corto · 488 × 434"
            : "En juego · escala del campo";
        if (current.battlefieldArtUrl) {
            const imageUrl = versionedArtUrl(current.battlefieldArtUrl, cardId);
            const nextUrl = new URL(imageUrl, window.location.href).href;
            if (gamePreviewImage.src !== nextUrl) {
                clearGameArtSourceSize();
                gamePreviewImage.src = imageUrl;
            } else {
                applyGameArtSourceSize();
            }
        } else {
            gamePreviewImage.removeAttribute("src");
            clearGameArtSourceSize();
        }
        gamePreviewImage.alt = current.nombre || current.id;
        gamePreviewTitle.textContent = isSupport ? "" : current.nombre || current.id;
        const hasStats = current.atk !== null && current.atk !== undefined
            && current.def !== null && current.def !== undefined;
        gamePreviewStats.hidden = isSupport || !hasStats;
        gamePreviewStats.textContent = !isSupport && hasStats
            ? `${current.atk} / ${current.def}`
            : "";
    }

    function applyMotifToPreview() {
        const doc = previewDocument();
        if (!doc) return;
        for (const { key } of MOTIF_SLOTS) {
            doc.body.style.removeProperty(`--motif-${key}-x`);
            doc.body.style.removeProperty(`--motif-${key}-y`);
            doc.body.style.removeProperty(`--motif-${key}-size`);
            doc.body.style.removeProperty(`--motif-${key}-rotation`);
        }
        for (const [slot, values] of Object.entries(draft().motif ?? {})) {
            if (values.x) doc.body.style.setProperty(`--motif-${slot}-x`, `${values.x}px`);
            if (values.y) doc.body.style.setProperty(`--motif-${slot}-y`, `${values.y}px`);
            if (values.zoom && values.zoom !== 1) {
                doc.body.style.setProperty(`--motif-${slot}-size`, `${values.zoom * 100}% auto`);
            }
            if (values.rotation) {
                doc.body.style.setProperty(`--motif-${slot}-rotation`, `${values.rotation}deg`);
            }
        }
    }

    function applyViewMode() {
        const doc = previewDocument();
        if (!doc) return;
        doc.body.classList.toggle("studio-focus", viewMode === "focus");
        doc.body.classList.toggle("studio-grid", viewMode === "grid");
        doc.documentElement.classList.toggle("studio-focus", viewMode === "focus");
        doc.documentElement.classList.toggle("studio-grid", viewMode === "grid");
        for (const entry of doc.querySelectorAll(".tcg-card")) {
            entry.classList.toggle("studio-selected", entry.dataset.cardId === cardId);
        }
        const container = doc.getElementById("cards-container");
        if (container) container.className = `cards-grid scale-${scale}`;
        renderGamePreview();
    }

    /* Factor real entre píxeles de pantalla y píxeles de la carta (la rejilla usa zoom). */
    function previewScale(element) {
        const width = element.getBoundingClientRect().width;
        return width > 0 ? width / CARD_WIDTH : 1;
    }

    function wirePreview() {
        const doc = previewDocument();
        if (!doc) return;

        let style = doc.getElementById("hostfall-studio-preview-css");
        if (!style) {
            style = doc.createElement("style");
            style.id = "hostfall-studio-preview-css";
            style.textContent = PREVIEW_CSS;
            doc.head.append(style);
        }

        for (const entry of doc.querySelectorAll(".tcg-card")) {
            const id = entry.dataset.cardId;
            applyFrameToPreview(id);

            const frameBox = entry.querySelector(".tcg-art-frame");
            if (!frameBox) continue;

            frameBox.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                selectCard(id);
                frameBox.setPointerCapture(event.pointerId);
                frameBox.classList.add("is-dragging");

                const factor = previewScale(entry);
                const start = frameOf(id);
                const originX = event.clientX;
                const originY = event.clientY;

                const move = (moveEvent) => {
                    setFrame(id, {
                        ...start,
                        x: Math.round(start.x + (moveEvent.clientX - originX) / factor),
                        y: Math.round(start.y + (moveEvent.clientY - originY) / factor)
                    });
                    syncArtInputs();
                };
                const stop = () => {
                    frameBox.removeEventListener("pointermove", move);
                    frameBox.removeEventListener("pointerup", stop);
                    frameBox.removeEventListener("pointercancel", stop);
                    frameBox.classList.remove("is-dragging");
                };

                frameBox.addEventListener("pointermove", move);
                frameBox.addEventListener("pointerup", stop);
                frameBox.addEventListener("pointercancel", stop);
            });

            frameBox.addEventListener(
                "wheel",
                (event) => {
                    event.preventDefault();
                    selectCard(id);
                    nudgeZoom(id, event.deltaY < 0 ? 1.04 : 1 / 1.04);
                },
                { passive: false }
            );

            /* Clic en cualquier otra parte de la carta: seleccionarla. */
            entry.addEventListener("pointerdown", (event) => {
                if (!event.target.closest(".tcg-art-frame")) selectCard(id);
            });
        }

        applyMotifToPreview();
        applyViewMode();
        doc.removeEventListener("keydown", onArrowKeys);
        doc.addEventListener("keydown", onArrowKeys);
    }

    function refreshPreviewCards() {
        const previewWindow = preview.contentWindow;
        const studio = previewWindow?.HostfallStudio;
        if (!studio) return;
        const sourceCards = studio.readGeneratedCards();
        for (const source of sourceCards) {
            const current = deck()?.cards.find((entry) => entry.id === source.id);
            if (current && typeof current.fullArt !== "boolean") {
                current.fullArt = Boolean(source.fullArt);
            }
        }
        const cards = sourceCards.map((entry) => ({
            ...entry,
            art_crop: versionedArtUrl(entry.art_crop, entry.id),
            fullArt: fullArtOf(entry.id),
            headerFade: headerFadeOf(entry.id)
        }));
        studio.renderCards(cards);
        wirePreview();
        renderArtControls();
        focusCardInPreview();
    }

    function nudgeZoom(id, factor) {
        const current = frameOf(id);
        const zoom = Math.min(6, Math.max(0.2, current.zoom * factor));
        setFrame(id, { ...current, zoom: Math.round(zoom * 1000) / 1000 });
        syncArtInputs();
    }

    function onArrowKeys(event) {
        const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const delta = keys[event.key];
        if (!delta || !cardId) return;
        if (event.target.matches?.("input, select, textarea")) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const current = frameOf(cardId);
        setFrame(cardId, {
            ...current,
            x: current.x + delta[0] * step,
            y: current.y + delta[1] * step
        });
        syncArtInputs();
    }

    function focusCardInPreview() {
        applyViewMode();
        cardElement(cardId)?.scrollIntoView({ block: "center", inline: "center" });
    }

    function loadPreview() {
        const current = deck();
        if (current) {
            preview.src = `${current.indexUrl}?lang=${encodeURIComponent(language)}&t=${Date.now()}`;
        }
    }

    preview.addEventListener("load", () => {
        refreshPreviewCards();
    });

    /* --------------------------------------------------------------- controles */

    /*
     * Una fila = etiqueta, valor actual, slider, número y un botón para volver al
     * valor por defecto. El valor va siempre visible: sin eso no se sabe qué se está tocando.
     */
    function control({ label, value, min, max, step, unit, isDefault, onInput }) {
        const field = document.createElement("div");
        field.className = "field";
        field.dataset.control = label;

        const head = document.createElement("div");
        head.className = "field-head";
        const name = document.createElement("span");
        name.className = "field-label";
        name.textContent = label;
        const readout = document.createElement("span");
        readout.className = "field-value";
        head.append(name, readout);

        const row = document.createElement("div");
        row.className = "field-row";
        const slider = Object.assign(document.createElement("input"), {
            type: "range", min, max, step, value
        });
        const number = Object.assign(document.createElement("input"), {
            type: "number", min, max, step, value
        });
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "reset-dot";
        reset.title = "Volver al valor por defecto";
        reset.textContent = "↺";
        row.append(slider, number, reset);

        const paint = (parsed) => {
            readout.textContent = `${parsed}${unit}`;
            reset.disabled = parsed === isDefault;
            reset.style.visibility = parsed === isDefault ? "hidden" : "visible";
        };
        const emit = (raw) => {
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) return;
            slider.value = parsed;
            number.value = parsed;
            paint(parsed);
            onInput(parsed);
        };

        slider.addEventListener("input", () => emit(slider.value));
        number.addEventListener("change", () => emit(number.value));
        reset.addEventListener("click", () => emit(isDefault));
        paint(Number(value));

        field.append(head, row);
        return field;
    }

    function renderArtControls() {
        artControls.replaceChildren();
        const current = card();

        artThumb.style.backgroundImage = current?.artCrop
            ? `url("${versionedArtUrl(`/dev/tools/Decks/${deckId}/${current.artCrop}`, cardId)}")`
            : "";
        artThumb.classList.toggle("is-empty", !current?.artCrop);
        artThumb.textContent = current?.artCrop ? "" : "+";
        artFileName.textContent = current?.artCrop
            ? current.artCrop.split("/").pop()
            : "Ningún arte todavía";

        fullArtToggle.disabled = !current || !supportsFullArtOverrides;
        fullArtToggle.checked = current ? fullArtOf(cardId) : false;
        headerFadeToggle.disabled = !current
            || !supportsHeaderFadeOverrides
            || fullArtOf(cardId);
        headerFadeToggle.checked = current ? headerFadeOf(cardId) : false;
        if (!current) return;
        const frame = frameOf(cardId);

        artControls.append(
            control({
                label: "Zoom", value: frame.zoom, min: 0.2, max: 4, step: 0.01,
                unit: "×", isDefault: 1,
                onInput: (value) => setFrame(cardId, { ...frameOf(cardId), zoom: value })
            }),
            control({
                label: "Horizontal", value: frame.x, min: -600, max: 600, step: 1,
                unit: " px", isDefault: 0,
                onInput: (value) => setFrame(cardId, { ...frameOf(cardId), x: value })
            }),
            control({
                label: "Vertical", value: frame.y, min: -600, max: 600, step: 1,
                unit: " px", isDefault: 0,
                onInput: (value) => setFrame(cardId, { ...frameOf(cardId), y: value })
            })
        );

        const clear = document.createElement("button");
        clear.type = "button";
        clear.style.width = "100%";
        clear.textContent = "Quitar todo el encuadre";
        clear.addEventListener("click", () => {
            setFrame(cardId, { ...DEFAULT_FRAME });
            renderArtControls();
        });
        artControls.append(clear);
    }

    function renderGameArtControls() {
        gameArtControls.replaceChildren();
        const current = card();
        gameArtSection.hidden = !current?.battlefieldArtEligible;
        if (!current?.battlefieldArtEligible) return;
        gameArtSectionLabel.textContent = current.battlefieldArtKind === "support"
            ? "Encuadre de Apoyo corto"
            : "Encuadre en juego";
        const frame = battlefieldFrameOf(cardId);

        gameArtControls.append(
            control({
                label: "Zoom en juego", value: frame.zoom, min: 0.2, max: 4, step: 0.01,
                unit: "\u00d7", isDefault: 1,
                onInput: (value) => setBattlefieldFrame(
                    cardId,
                    { ...battlefieldFrameOf(cardId), zoom: value }
                )
            }),
            control({
                label: "Horizontal en juego", value: frame.x,
                min: -GAME_ART_WIDTH, max: GAME_ART_WIDTH, step: 1,
                unit: " px", isDefault: 0,
                onInput: (value) => setBattlefieldFrame(
                    cardId,
                    { ...battlefieldFrameOf(cardId), x: value }
                )
            }),
            control({
                label: "Vertical en juego", value: frame.y,
                min: -GAME_ART_HEIGHT, max: GAME_ART_HEIGHT, step: 1,
                unit: " px", isDefault: 0,
                onInput: (value) => setBattlefieldFrame(
                    cardId,
                    { ...battlefieldFrameOf(cardId), y: value }
                )
            })
        );

        for (const input of gameArtControls.querySelectorAll("input, button")) {
            input.disabled = !supportsBattlefieldArtFrames;
        }
        const clear = document.createElement("button");
        clear.type = "button";
        clear.style.width = "100%";
        clear.disabled = !supportsBattlefieldArtFrames || !isAdjusted(frame);
        clear.textContent = "Restablecer encuadre en juego";
        clear.addEventListener("click", () => {
            setBattlefieldFrame(cardId, { ...DEFAULT_FRAME });
            renderGameArtControls();
        });
        gameArtControls.append(clear);
    }

    /* Reescribe sólo los valores, para no perder el foco mientras se arrastra. */
    function syncArtInputs() {
        const frame = frameOf(cardId);
        const values = { Zoom: [frame.zoom, "×"], Horizontal: [frame.x, " px"], Vertical: [frame.y, " px"] };
        for (const field of artControls.querySelectorAll(".field")) {
            const entry = values[field.dataset.control];
            if (!entry) continue;
            for (const input of field.querySelectorAll("input")) input.value = entry[0];
            field.querySelector(".field-value").textContent = `${entry[0]}${entry[1]}`;
            const reset = field.querySelector(".reset-dot");
            const atDefault = field.dataset.control === "Zoom" ? entry[0] === 1 : entry[0] === 0;
            reset.disabled = atDefault;
            reset.style.visibility = atDefault ? "hidden" : "visible";
        }
    }

    function syncGameArtInputs() {
        const frame = battlefieldFrameOf(cardId);
        const values = {
            "Zoom en juego": [frame.zoom, "\u00d7"],
            "Horizontal en juego": [frame.x, " px"],
            "Vertical en juego": [frame.y, " px"]
        };
        for (const field of gameArtControls.querySelectorAll(".field")) {
            const entry = values[field.dataset.control];
            if (!entry) continue;
            for (const input of field.querySelectorAll("input")) input.value = entry[0];
            field.querySelector(".field-value").textContent = `${entry[0]}${entry[1]}`;
            const reset = field.querySelector(".reset-dot");
            const atDefault = field.dataset.control === "Zoom en juego"
                ? entry[0] === 1
                : entry[0] === 0;
            reset.disabled = atDefault;
            reset.style.visibility = atDefault ? "hidden" : "visible";
        }
    }

    function renderSlotPicker() {
        slotPicker.replaceChildren();
        for (const { key, label } of MOTIF_SLOTS) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.classList.toggle("is-on", key === motifSlot);
            const values = motifOf(key);
            button.classList.toggle(
                "dirty",
                values.x !== 0 || values.y !== 0 || values.zoom !== 1 || values.rotation !== 0
            );
            button.addEventListener("click", () => {
                motifSlot = key;
                renderSlotPicker();
                renderMotifControls();
            });
            slotPicker.append(button);
        }
    }

    function renderMotifControls() {
        motifControls.replaceChildren();
        const values = motifOf(motifSlot);

        motifControls.append(
            control({
                label: "Zoom", value: values.zoom, min: 0.2, max: 4, step: 0.01,
                unit: "×", isDefault: 1,
                onInput: (value) => setMotif(motifSlot, { ...motifOf(motifSlot), zoom: value })
            }),
            control({
                label: "Horizontal", value: values.x, min: -200, max: 200, step: 1,
                unit: " px", isDefault: 0,
                onInput: (value) => setMotif(motifSlot, { ...motifOf(motifSlot), x: value })
            }),
            control({
                label: "Vertical", value: values.y, min: -200, max: 200, step: 1,
                unit: " px", isDefault: 0,
                onInput: (value) => setMotif(motifSlot, { ...motifOf(motifSlot), y: value })
            }),
            control({
                label: "Rotación", value: values.rotation, min: -180, max: 180, step: 1,
                unit: "°", isDefault: 0,
                onInput: (value) => setMotif(
                    motifSlot,
                    { ...motifOf(motifSlot), rotation: value }
                )
            })
        );
    }

    function renderCardList() {
        cardList.replaceChildren();
        const visibleLanguageCards = cards();
        const normalizedQuery = searchQuery.trim().toLocaleLowerCase("es");
        const visibleCards = visibleLanguageCards.filter((entry) => {
            const frame = frameOf(entry.id);
            const battlefieldFrame = battlefieldFrameOf(entry.id);
            const matchesFilter = listFilter === "missing"
                ? !entry.artCrop
                : listFilter === "adjusted"
                    ? isAdjusted(frame) || isAdjusted(battlefieldFrame)
                    : true;
            const searchable = `${entry.nombre ?? ""} ${entry.id} ${entry.collectorId ?? ""} ${entry.tipo ?? ""}`
                .toLocaleLowerCase("es");
            return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
        });

        for (const entry of visibleCards) {
            const frame = frameOf(entry.id);
            const battlefieldFrame = battlefieldFrameOf(entry.id);
            const cardNumber = visibleLanguageCards.findIndex((cardEntry) => cardEntry.id === entry.id) + 1;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "card-entry";
            button.classList.toggle("is-active", entry.id === cardId);
            button.setAttribute("aria-current", entry.id === cardId ? "true" : "false");
            button.title = `${entry.nombre || entry.id}\n${entry.id}`;

            const thumb = document.createElement("span");
            thumb.className = "thumb";
            thumb.setAttribute("aria-hidden", "true");
            if (entry.artCrop) {
                thumb.style.backgroundImage = `url("${versionedArtUrl(
                    `/dev/tools/Decks/${deckId}/${entry.artCrop}`,
                    entry.id
                )}")`;
            } else {
                thumb.classList.add("is-empty");
                thumb.textContent = "+";
            }

            const text = document.createElement("span");
            text.className = "entry-text";
            const name = document.createElement("span");
            name.className = "entry-name";
            name.textContent = entry.nombre || entry.id;
            const meta = document.createElement("span");
            meta.className = "entry-meta";
            meta.textContent = `${entry.collectorId ?? `#${String(cardNumber).padStart(3, "0")}`} · ${entry.tipo || "Carta"}`;
            const id = document.createElement("span");
            id.className = "entry-id";
            id.textContent = entry.id;
            text.append(name, meta, id);

            const badge = document.createElement("span");
            if (!entry.artCrop) {
                badge.className = "badge badge-noart";
                badge.textContent = "sin arte";
            } else if (isAdjusted(frame)) {
                badge.className = "badge badge-frame";
                badge.textContent = `${frame.zoom}×`;
            }

            if (entry.artCrop && !isAdjusted(frame) && isAdjusted(battlefieldFrame)) {
                badge.className = "badge badge-frame";
                badge.textContent = "juego";
            }

            button.append(thumb, text, badge);
            button.addEventListener("click", () => {
                selectCard(entry.id);
                focusCardInPreview();
            });
            cardList.append(button);
        }

        if (visibleCards.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-note";
            empty.textContent = normalizedQuery
                ? "No hay cartas que coincidan con la búsqueda."
                : listFilter === "missing"
                    ? "Todas las cartas tienen arte."
                    : "Todavía no hay cartas con un encuadre ajustado.";
            cardList.append(empty);
        }

    }

    function renderSelectedHead() {
        const current = card();
        const visibleLanguageCards = cards();
        const index = visibleLanguageCards.findIndex((entry) => entry.id === cardId);
        selectedName.textContent = current?.nombre ?? "—";
        selectedMeta.textContent = current
            ? `${current.tipo} · carta ${index + 1} de ${visibleLanguageCards.length}`
            : "";
        selectedPosition.textContent = current
            ? `${current.collectorId ?? `#${String(index + 1).padStart(3, "0")}`} · ${deck()?.title ?? deckId}`
            : "";
        selectedId.textContent = current?.collectorId ?? current?.id ?? "—";
        copyCardId.disabled = !current;
    }

    function selectCard(id) {
        if (cardId === id) return;
        cardId = id;
        renderCardList();
        renderSelectedHead();
        renderArtControls();
        renderGameArtControls();
        renderGamePreview();
        applyViewMode();
    }

    function renderLanguageSelect() {
        const currentDeck = deck();
        const available = currentDeck?.languages ?? [
            { code: "es", label: "Español", htmlLang: "es" }
        ];
        if (!available.some((entry) => entry.code === language)) {
            language = currentDeck?.defaultLanguage ?? available[0]?.code ?? "es";
        }
        languageSelect.replaceChildren();
        for (const entry of available) {
            const option = document.createElement("option");
            option.value = entry.code;
            option.textContent = entry.label;
            languageSelect.append(option);
        }
        languageSelect.value = language;
        languageSelect.disabled = available.length < 2;
    }

    function selectDeck(id) {
        deckId = id;
        renderLanguageSelect();
        cardId = deck()?.cards[0]?.id ?? "";
        searchQuery = "";
        listFilter = "all";
        cardSearch.value = "";
        renderListFilter();
        renderAll();
        loadPreview();
    }

    function renderListFilter() {
        for (const button of cardFilter.querySelectorAll("button")) {
            const active = button.dataset.filter === listFilter;
            button.classList.toggle("is-on", active);
            button.setAttribute("aria-pressed", String(active));
        }
    }

    function renderAll() {
        renderCardList();
        renderSelectedHead();
        renderArtControls();
        renderGameArtControls();
        renderGamePreview();
        renderSlotPicker();
        renderMotifControls();
        renderDirty();
    }

    /* ------------------------------------------------------------------ datos */

    async function api(path, options) {
        const response = await fetch(path, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        return payload;
    }

    async function loadDecks(keepSelection = false) {
        const payload = await api("/api/decks");
        decks = payload.decks;
        lastRegenerated = payload.regenerated ?? [];
        supportsFullArtOverrides = payload.capabilities?.fullArtOverrides === true;
        supportsHeaderFadeOverrides = payload.capabilities?.headerFadeOverrides === true;
        supportsBattlefieldArtFrames = payload.capabilities?.battlefieldArtFrames === true;

        deckSelect.replaceChildren();
        for (const entry of decks) {
            const option = document.createElement("option");
            option.value = entry.id;
            option.textContent = entry.previewOnly ? `${entry.title} (preview)` : entry.title;
            deckSelect.append(option);
        }

        const target = keepSelection && decks.some((entry) => entry.id === deckId)
            ? deckId
            : decks[0].id;
        deckSelect.value = target;

        if (keepSelection) {
            deckId = target;
            renderLanguageSelect();
            renderAll();
        } else {
            selectDeck(target);
        }

        if (!supportsFullArtOverrides) {
            setStatus("Reinicia el servidor del taller para activar Full art.", "error");
        }
        else if (!supportsHeaderFadeOverrides) {
            setStatus("Reinicia el servidor del taller para activar Fade superior.", "error");
        }
        else if (!supportsBattlefieldArtFrames) {
            setStatus("Reinicia el servidor del taller para activar Encuadre en juego.", "error");
        }
    }

    async function uploadArt(file) {
        const targetDeckId = deckId;
        const targetCardId = cardId;
        const extension = (file.name.split(".").pop() || "").toLowerCase();
        setStatus(`Subiendo ${file.name}…`);
        try {
            const result = await api(
                `/api/art?deck=${encodeURIComponent(targetDeckId)}`
                    + `&card=${encodeURIComponent(targetCardId)}&ext=${encodeURIComponent(extension)}`,
                { method: "POST", body: file }
            );
            markArtUploaded(targetDeckId, targetCardId);
            await loadDecks(true);
            loadPreview();
            setStatus(`Arte guardado en ${result.artCrop}`, "ok");
        } catch (error) {
            setStatus(error.message, "error");
        }
    }

    /* ------------------------------------------------------------------ eventos */

    saveButton.addEventListener("click", async () => {
        const current = draft();
        saveButton.disabled = true;
        setStatus("Guardando…");
        try {
            await api("/api/save", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    deck: deckId,
                    artFrames: Object.fromEntries(current.artFrames),
                    fullArtOverrides: Object.fromEntries(current.fullArtOverrides),
                    headerFadeOverrides: Object.fromEntries(current.headerFadeOverrides),
                    battlefieldArtFrames: Object.fromEntries(current.battlefieldArtFrames),
                    motif: current.motif
                })
            });
            pending.delete(deckId);
            await loadDecks(true);
            loadPreview();
            setStatus("Encuadres guardados.", "ok");
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            saveButton.disabled = false;
        }
    });

    resetButton.addEventListener("click", () => {
        if (!isDirty()) {
            setStatus("No hay cambios sin guardar.");
            return;
        }
        pending.delete(deckId);
        renderAll();
        loadPreview();
        setStatus("Se descartaron los cambios sin guardar.");
    });

    reloadButton.addEventListener("click", async () => {
        reloadButton.disabled = true;
        setStatus("Releyendo los datos…");
        try {
            await loadDecks(true);
            loadPreview();
            setStatus(
                lastRegenerated.length > 0
                    ? `Datos actualizados desde el JSON (${lastRegenerated.length} deck(s)).`
                    : "Los datos ya estaban al día.",
                "ok"
            );
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            reloadButton.disabled = false;
        }
    });

    deckSelect.addEventListener("change", () => selectDeck(deckSelect.value));

    languageSelect.addEventListener("change", () => {
        language = languageSelect.value;
        renderAll();
        loadPreview();
    });

    cardSearch.addEventListener("input", () => {
        searchQuery = cardSearch.value;
        renderCardList();
    });

    cardFilter.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        listFilter = button.dataset.filter;
        renderListFilter();
        renderCardList();
    });

    copyCardId.addEventListener("click", async () => {
        const current = card();
        if (!current) return;
        const id = current.collectorId ?? current.id;
        try {
            await navigator.clipboard.writeText(id);
            setStatus(`ID copiado: ${id}`, "ok");
        } catch {
            setStatus(`ID: ${id}`);
        }
    });

    el("view-mode").addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        viewMode = button.dataset.view;
        for (const other of el("view-mode").children) {
            other.classList.toggle("is-on", other === button);
        }
        focusCardInPreview();
    });

    el("zoom-mode").addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        scale = Number(button.dataset.scale);
        for (const other of el("zoom-mode").children) {
            other.classList.toggle("is-on", other === button);
        }
        focusCardInPreview();
    });

    el("tabs").addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        for (const other of el("tabs").children) {
            other.classList.toggle("is-on", other === button);
        }
        el("tab-art").hidden = button.dataset.tab !== "art";
        el("tab-motif").hidden = button.dataset.tab !== "motif";
    });

    artFile.addEventListener("change", async () => {
        const file = artFile.files?.[0];
        if (file && cardId) await uploadArt(file);
        artFile.value = "";
    });

    fullArtToggle.addEventListener("change", () => {
        if (cardId) setFullArt(cardId, fullArtToggle.checked);
    });

    headerFadeToggle.addEventListener("change", () => {
        if (cardId) setHeaderFade(cardId, headerFadeToggle.checked);
    });

    gamePreviewImage.addEventListener("load", applyGameArtSourceSize);

    gamePreview.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !cardId || !supportsBattlefieldArtFrames) return;
        event.preventDefault();
        gamePreview.setPointerCapture(event.pointerId);
        gamePreview.classList.add("is-dragging");
        const start = battlefieldFrameOf(cardId);
        const originX = event.clientX;
        const originY = event.clientY;
        const width = gamePreview.getBoundingClientRect().width || GAME_ART_WIDTH;
        const factor = GAME_ART_WIDTH / width;

        const move = (moveEvent) => {
            setBattlefieldFrame(cardId, {
                ...start,
                x: start.x + (moveEvent.clientX - originX) * factor,
                y: start.y + (moveEvent.clientY - originY) * factor
            });
            syncGameArtInputs();
        };
        const stop = () => {
            gamePreview.removeEventListener("pointermove", move);
            gamePreview.removeEventListener("pointerup", stop);
            gamePreview.removeEventListener("pointercancel", stop);
            gamePreview.classList.remove("is-dragging");
            renderGameArtControls();
        };

        gamePreview.addEventListener("pointermove", move);
        gamePreview.addEventListener("pointerup", stop);
        gamePreview.addEventListener("pointercancel", stop);
    });

    gamePreview.addEventListener("wheel", (event) => {
        if (!cardId || !supportsBattlefieldArtFrames) return;
        event.preventDefault();
        const current = battlefieldFrameOf(cardId);
        const zoom = Math.round(Math.min(
            4,
            Math.max(0.2, current.zoom * (event.deltaY < 0 ? 1.04 : 1 / 1.04))
        ) * 1000) / 1000;
        setBattlefieldFrame(cardId, { ...current, zoom });
        syncGameArtInputs();
    }, { passive: false });

    for (const [event, handler] of [
        ["dragover", (e) => { e.preventDefault(); artDrop.classList.add("is-over"); }],
        ["dragleave", () => artDrop.classList.remove("is-over")],
        ["drop", async (e) => {
            e.preventDefault();
            artDrop.classList.remove("is-over");
            const file = e.dataTransfer?.files?.[0];
            if (file && cardId) await uploadArt(file);
        }]
    ]) {
        artDrop.addEventListener(event, handler);
    }

    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("es") === "f") {
            event.preventDefault();
            cardSearch.focus();
            cardSearch.select();
            return;
        }
        onArrowKeys(event);
    });

    window.addEventListener("beforeunload", (event) => {
        if (isDirty()) event.preventDefault();
    });

    loadDecks().catch((error) => {
        setStatus(`No se pudo hablar con el servidor: ${error.message}`, "error");
    });
})();
