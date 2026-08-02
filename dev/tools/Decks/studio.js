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
    const DEFAULT_FRAME = Object.freeze({ zoom: 1, x: 0, y: 0 });
    const MOTIF_SLOTS = [
        { key: "head", label: "Cabecera" },
        { key: "gem", label: "Gema de coste" },
        { key: "band", label: "Banda de tipo" },
        { key: "stats", label: "Stats" }
    ];

    const deckSelect = document.getElementById("deck-select");
    const cardList = document.getElementById("card-list");
    const preview = document.getElementById("preview");
    const artControls = document.getElementById("art-controls");
    const motifControls = document.getElementById("motif-controls");
    const artFile = document.getElementById("art-file");
    const statusLine = document.getElementById("status");
    const saveButton = document.getElementById("save");
    const resetButton = document.getElementById("reset");
    const fitButton = document.getElementById("fit-card");
    const reloadButton = document.getElementById("reload-data");

    /** Ediciones sin guardar, por deck. */
    const pending = new Map();
    let decks = [];
    let deckId = "";
    let cardId = "";
    let lastRegenerated = [];

    function deck() {
        return decks.find((entry) => entry.id === deckId) ?? null;
    }

    function draft() {
        if (!pending.has(deckId)) {
            const current = deck();
            pending.set(deckId, {
                artFrames: new Map(
                    (current?.cards ?? []).map((card) => [card.id, card.artFrame ?? null])
                ),
                motif: structuredClone(current?.motif ?? null)
            });
        }
        return pending.get(deckId);
    }

    function frameOf(id) {
        const stored = draft().artFrames.get(id);
        return { ...DEFAULT_FRAME, ...(stored ?? {}) };
    }

    function isAdjusted(frame) {
        return frame.zoom !== 1 || frame.x !== 0 || frame.y !== 0;
    }

    function setFrame(id, frame) {
        draft().artFrames.set(id, isAdjusted(frame) ? frame : null);
        applyFrameToPreview(id);
        renderCardList();
    }

    function motifOf(slot) {
        const stored = draft().motif?.[slot];
        return { x: stored?.x ?? 0, y: stored?.y ?? 0, ...(stored?.size ? { size: stored.size } : {}) };
    }

    function setMotif(slot, values) {
        const current = draft();
        const next = current.motif ? { ...current.motif } : {};
        if (values.x === 0 && values.y === 0 && !values.size) delete next[slot];
        else next[slot] = values;
        current.motif = Object.keys(next).length > 0 ? next : null;
        applyMotifToPreview();
    }

    function setStatus(message, kind = "") {
        statusLine.textContent = message;
        statusLine.className = kind;
    }

    /* ---------------------------------------------------------------- iframe */

    function previewDocument() {
        try {
            return preview.contentDocument;
        } catch {
            return null;
        }
    }

    function cardElement(id) {
        const doc = previewDocument();
        return doc ? doc.querySelector(`.tcg-card[data-card-id="${CSS.escape(id)}"]`) : null;
    }

    function applyFrameToPreview(id) {
        const element = cardElement(id);
        const image = element?.querySelector(".tcg-art-image");
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

    function applyMotifToPreview() {
        const doc = previewDocument();
        if (!doc) return;
        const body = doc.body;
        for (const { key } of MOTIF_SLOTS) {
            body.style.removeProperty(`--motif-${key}-x`);
            body.style.removeProperty(`--motif-${key}-y`);
            body.style.removeProperty(`--motif-${key}-size`);
        }
        const motif = draft().motif;
        if (!motif) return;
        for (const [slot, values] of Object.entries(motif)) {
            if (values.x) body.style.setProperty(`--motif-${slot}-x`, `${values.x}px`);
            if (values.y) body.style.setProperty(`--motif-${slot}-y`, `${values.y}px`);
            if (values.size) body.style.setProperty(`--motif-${slot}-size`, `${values.size}px auto`);
        }
    }

    /* Factor real entre píxeles de pantalla y píxeles de la carta (la rejilla usa zoom). */
    function previewScale(element) {
        const width = element.getBoundingClientRect().width;
        return width > 0 ? width / CARD_WIDTH : 1;
    }

    function wirePreview() {
        const doc = previewDocument();
        if (!doc) return;

        for (const card of doc.querySelectorAll(".tcg-card")) {
            applyFrameToPreview(card.dataset.cardId);
        }
        applyMotifToPreview();

        for (const card of doc.querySelectorAll(".tcg-card")) {
            const id = card.dataset.cardId;
            const frameBox = card.querySelector(".tcg-art-frame");
            if (!frameBox) continue;

            frameBox.style.cursor = "grab";

            frameBox.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                selectCard(id);
                event.preventDefault();
                frameBox.setPointerCapture(event.pointerId);
                frameBox.style.cursor = "grabbing";

                const scale = previewScale(card);
                const start = frameOf(id);
                const originX = event.clientX;
                const originY = event.clientY;

                const move = (moveEvent) => {
                    setFrame(id, {
                        ...start,
                        x: Math.round(start.x + (moveEvent.clientX - originX) / scale),
                        y: Math.round(start.y + (moveEvent.clientY - originY) / scale)
                    });
                    syncArtInputs();
                };
                const stop = () => {
                    frameBox.removeEventListener("pointermove", move);
                    frameBox.removeEventListener("pointerup", stop);
                    frameBox.removeEventListener("pointercancel", stop);
                    frameBox.style.cursor = "grab";
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
                    const current = frameOf(id);
                    const factor = event.deltaY < 0 ? 1.04 : 1 / 1.04;
                    setFrame(id, {
                        ...current,
                        zoom: Math.round(Math.min(6, Math.max(0.2, current.zoom * factor)) * 1000) / 1000
                    });
                    syncArtInputs();
                },
                { passive: false }
            );
        }
    }

    function focusCardInPreview() {
        const element = cardElement(cardId);
        if (!element) return;
        element.scrollIntoView({ block: "center", inline: "center" });
        const doc = previewDocument();
        for (const card of doc.querySelectorAll(".tcg-card")) {
            card.style.outline = card.dataset.cardId === cardId
                ? "3px solid rgba(184, 162, 107, 0.85)"
                : "";
            card.style.outlineOffset = card.dataset.cardId === cardId ? "8px" : "";
        }
    }

    function loadPreview() {
        const current = deck();
        if (!current) return;
        preview.src = `${current.indexUrl}?t=${Date.now()}`;
    }

    preview.addEventListener("load", () => {
        wirePreview();
        focusCardInPreview();
    });

    /* --------------------------------------------------------------- controles */

    function control(label, value, min, max, step, onInput) {
        const row = document.createElement("div");
        row.className = "row";

        const name = document.createElement("label");
        name.textContent = label;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;

        const number = document.createElement("input");
        number.type = "number";
        number.step = step;
        number.value = value;

        const emit = (raw) => {
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) return;
            slider.value = parsed;
            number.value = parsed;
            onInput(parsed);
        };

        slider.addEventListener("input", () => emit(slider.value));
        number.addEventListener("change", () => emit(number.value));

        row.append(name, slider, number);
        row.dataset.control = label;
        return row;
    }

    function renderArtControls() {
        artControls.replaceChildren();
        if (!cardId) return;
        const frame = frameOf(cardId);

        artControls.append(
            control("Zoom", frame.zoom, 0.2, 4, 0.01, (value) => {
                setFrame(cardId, { ...frameOf(cardId), zoom: value });
            }),
            control("X (px)", frame.x, -600, 600, 1, (value) => {
                setFrame(cardId, { ...frameOf(cardId), x: value });
            }),
            control("Y (px)", frame.y, -600, 600, 1, (value) => {
                setFrame(cardId, { ...frameOf(cardId), y: value });
            })
        );

        const clear = document.createElement("button");
        clear.type = "button";
        clear.textContent = "Quitar encuadre";
        clear.addEventListener("click", () => {
            setFrame(cardId, { ...DEFAULT_FRAME });
            renderArtControls();
        });
        artControls.append(clear);
    }

    /* Reescribe sólo los valores, para no perder el foco mientras se arrastra. */
    function syncArtInputs() {
        const frame = frameOf(cardId);
        const values = { "Zoom": frame.zoom, "X (px)": frame.x, "Y (px)": frame.y };
        for (const row of artControls.querySelectorAll(".row")) {
            const value = values[row.dataset.control];
            if (value === undefined) continue;
            for (const input of row.querySelectorAll("input")) input.value = value;
        }
    }

    function renderMotifControls() {
        motifControls.replaceChildren();
        for (const { key, label } of MOTIF_SLOTS) {
            const title = document.createElement("div");
            title.textContent = label;
            title.style.cssText = "margin:10px 0 6px;color:#8e8375;font-size:12px;";
            motifControls.append(
                title,
                control(`${label} X`, motifOf(key).x, -200, 200, 1, (value) => {
                    setMotif(key, { ...motifOf(key), x: value });
                }),
                control(`${label} Y`, motifOf(key).y, -200, 200, 1, (value) => {
                    setMotif(key, { ...motifOf(key), y: value });
                })
            );
        }
    }

    function renderCardList() {
        cardList.replaceChildren();
        for (const card of deck()?.cards ?? []) {
            const entry = document.createElement("button");
            entry.type = "button";
            entry.className = "card-entry";
            if (card.id === cardId) entry.classList.add("is-active");
            if (card.artCrop) entry.classList.add("has-art");
            if (isAdjusted(frameOf(card.id))) entry.classList.add("is-adjusted");

            const dot = document.createElement("span");
            dot.className = "dot";
            const label = document.createElement("span");
            label.className = "label";
            label.textContent = card.nombre || card.id;

            entry.append(dot, label);
            entry.addEventListener("click", () => {
                selectCard(card.id);
                focusCardInPreview();
            });
            cardList.append(entry);
        }
    }

    function selectCard(id) {
        if (cardId === id) return;
        cardId = id;
        renderCardList();
        renderArtControls();
    }

    function selectDeck(id) {
        deckId = id;
        const current = deck();
        cardId = current?.cards[0]?.id ?? "";
        renderCardList();
        renderArtControls();
        renderMotifControls();
        loadPreview();
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
            renderCardList();
            renderArtControls();
            renderMotifControls();
        } else {
            selectDeck(target);
        }
    }

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
                    motif: current.motif
                })
            });
            pending.delete(deckId);
            await loadDecks(true);
            loadPreview();
            setStatus("Guardado en studio.config.json.", "ok");
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            saveButton.disabled = false;
        }
    });

    resetButton.addEventListener("click", () => {
        pending.delete(deckId);
        renderCardList();
        renderArtControls();
        renderMotifControls();
        loadPreview();
        setStatus("Se descartaron los cambios sin guardar.");
    });

    fitButton.addEventListener("click", focusCardInPreview);

    /*
     * Relee los JSON de src/data/decks/ y vuelve a proyectar las cartas.
     * Los cambios sin guardar del encuadre se conservan; sólo se refrescan los datos.
     */
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

    artFile.addEventListener("change", async () => {
        const file = artFile.files?.[0];
        if (!file || !cardId) return;
        const extension = (file.name.split(".").pop() || "").toLowerCase();
        setStatus(`Subiendo ${file.name}…`);
        try {
            const result = await api(
                `/api/art?deck=${encodeURIComponent(deckId)}`
                    + `&card=${encodeURIComponent(cardId)}&ext=${encodeURIComponent(extension)}`,
                { method: "POST", body: file }
            );
            await loadDecks(true);
            loadPreview();
            setStatus(`Arte guardado en ${result.artCrop}`, "ok");
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            artFile.value = "";
        }
    });

    loadDecks().catch((error) => {
        setStatus(`No se pudo hablar con el servidor: ${error.message}`, "error");
    });
})();
