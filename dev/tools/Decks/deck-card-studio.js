(() => {
    "use strict";

    const body = document.body;
    const container = document.getElementById("cards-container");
    const status = document.getElementById("studio-status");
    const generatedData = window.HostfallDeckData;
    const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
    const CARD_WIDTH = 976;
    const CARD_HEIGHT = 1360;
    const setCode = (body.dataset.setCode || "HFX").toUpperCase();
    const theme = body.dataset.theme || "";
    const cardText = window.HostfallCardText;

    function generatedLanguages(payload) {
        if (!payload || !Array.isArray(payload.languages)) {
            return [{ code: "es", label: "Español", htmlLang: "es" }];
        }
        return payload.languages.filter((entry) => entry?.code);
    }

    const languages = generatedLanguages(generatedData);
    const defaultLanguage = String(generatedData?.defaultLanguage || "es");
    const language = languages.some((entry) => entry.code === requestedLanguage)
        ? requestedLanguage
        : defaultLanguage;
    const languageMeta = languages.find((entry) => entry.code === language);
    document.documentElement.lang = languageMeta?.htmlLang || language;

    if (!cardText) {
        throw new Error("No se cargó deck-card-text.js antes del estudio de cartas.");
    }

    const typeSymbols = {
        criatura: "♞",
        eco: "◉",
        echo: "◉",
        enchantment: "✦",
        encantamiento: "✦",
        support: "✦",
        apoyo: "✦",
        instant: "✧",
        instantáneo: "✧",
        hechizo: "✧",
        spell: "✧",
        sorcery: "☄",
        conjuro: "☄",
        energía: "◆",
        energy: "◆",
        fuente: "◆",
        source: "◆",
        tierra: "▲",
        land: "▲"
    };

    /*
     * Símbolos de facción del renderer compartido. La estructura y la geometría de carta
     * son únicas; cada deck sólo aporta color, motivo e insignia.
     */
    const LAST_RAIN_LEAF = `
                <svg viewBox="0 0 64 64"><path d="M54 7C33 8 18 17 13 33c-3 10 1 18 9 22 8 3 17 0 22-8 7-11 8-25 10-40ZM17 52c8-12 17-21 29-31-10 5-21 12-31 23l2 8Z"></path></svg>
            `;

    /*
     * Cada deck comparte el mismo renderer; lo que cambia es este perfil.
     * Añadir un deck nuevo es añadir una entrada aquí, no otro index.html con su propio JS.
     */
    const footerSeparator = "·";

    function deckSeal() {
        return theme === "pact_of_elarion" ? LAST_RAIN_LEAF : factionSymbol();
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatEffectText(value) {
        const tapTitle = language === "en" ? "Exhaust / Activate" : "Agotar / Activar";
        const energyTitle = language === "en" ? "Energy" : "Energía";
        const tapIconHtml = `<span class="symbol-badge symbol-tap" title="${tapTitle}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 2h12v4c0 2.4-1.3 4.2-4 6 2.7 1.8 4 3.6 4 6v4H6v-4c0-2.4 1.3-4.2 4-6-2.7-1.8-4-3.6-4-6V2Zm2 2v2c0 1.7 1.1 3 4 4.9 2.9-1.9 4-3.2 4-4.9V4H8Zm4 9.1C9.1 15 8 16.3 8 18v2h8v-2c0-1.7-1.1-3-4-4.9Z"/></svg></span>`;
        return cardText.formatEffectText(value, {
            tapIconHtml,
            energyIconHtml:
                `<span class="symbol-badge symbol-energy" title="${energyTitle}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg></span>`,
        });
    }

    function typeSymbol(type) {
        const normalized = String(type || "").toLocaleLowerCase("es");

        if (theme === "pact_of_elarion") {
            if (normalized.includes("eco")) {
                return `
                <svg class="tcg-echo-icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
                    <path fill="currentColor" d="M32 20 39 32 32 44 25 32 32 20Z"></path>
                    <path fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" d="M20.5 22.5A15 15 0 0 0 20.5 41.5M43.5 22.5A15 15 0 0 1 43.5 41.5M12.5 15A26 26 0 0 0 12.5 49M51.5 15A26 26 0 0 1 51.5 49"></path>
                </svg>
            `;
            }
            if (normalized.includes("hechizo")) {
                return `
                <svg class="tcg-type-symbol tcg-type-symbol--spell" aria-hidden="true" viewBox="0 0 576 512">
                    <path d="M0 80v48c0 17.7 14.3 32 32 32H48 96V80c0-26.5-21.5-48-48-48S0 53.5 0 80zM112 32c10 13.4 16 30 16 48V384c0 35.3 28.7 64 64 64s64-28.7 64-64v-5.3c0-32.4 26.3-58.7 58.7-58.7H480V128c0-53-43-96-96-96H112zM464 480c61.9 0 112-50.1 112-112c0-8.8-7.2-16-16-16H314.7c-14.7 0-26.7 11.9-26.7 26.7V384c0 53-43 96-96 96H368h96z"></path>
                </svg>
            `;
            }
            return `
                <svg class="tcg-type-symbol" aria-hidden="true" viewBox="0 0 64 64">
                    <path d="M32 4 58 24 32 60 6 24 32 4Zm0 8L15 25l17 24 17-24-17-13Z"></path>
                </svg>
            `;
        }

        if (
            theme === "uprising_of_the_graveless"
            || theme === "legion_of_varka"
            || theme === "court_of_the_crimson_eclipse"
            || theme === "hunters"
        ) {
            if (theme === "hunters" && normalized.includes("trampa")) {
                return `
                    <svg class="fa-inline-icon tcg-trap-icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
                        <path fill="currentColor" d="M7 18h10l7 11 8-14 8 14 7-11h10L45 40H19L7 18Zm12 27h26v6H19v-6Z"></path>
                        <path fill="currentColor" d="M12 10h8l4 8-6 4-6-12Zm32 0h8l-6 12-6-4 4-8Z"></path>
                    </svg>
                `;
            }
            if (normalized.includes("eco") || normalized.includes("echo")) {
                return `
                    <svg class="fa-inline-icon tcg-echo-icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
                        <path fill="currentColor" d="M32 20 39 32 32 44 25 32 32 20Z"></path>
                        <path fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" d="M20.5 22.5A15 15 0 0 0 20.5 41.5M43.5 22.5A15 15 0 0 1 43.5 41.5M12.5 15A26 26 0 0 0 12.5 49M51.5 15A26 26 0 0 1 51.5 49"></path>
                    </svg>
                `;
            }
            if (
                theme === "court_of_the_crimson_eclipse"
                && (
                    normalized.includes("fuente")
                    || normalized.includes("source")
                    || normalized.includes("energía")
                    || normalized.includes("energy")
                )
            ) {
                return '<svg class="fa-inline-icon tcg-source-icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64"><path fill="currentColor" d="M32 4 58 24 32 60 6 24 32 4Zm0 8L15 25l17 24 17-24-17-13Z"></path></svg>';
            }
            if (normalized.includes("criatura")) {
                return `
                    <svg class="fa-inline-icon" aria-hidden="true" focusable="false" viewBox="0 0 512 512">
                        <path fill="currentColor" d="M226.5 92.9c14.3 42.9-.3 86.2-32.6 96.8s-70.1-15.6-84.4-58.5s.3-86.2 32.6-96.8s70.1 15.6 84.4 58.5zM100.4 198.6c18.9 32.4 14.3 70.1-10.2 84.1s-59.7-.9-78.5-33.3S-2.7 179.3 21.8 165.3s59.7 .9 78.5 33.3zM69.2 401.2C121.6 259.9 214.7 224 256 224s134.4 35.9 186.8 177.2c3.6 9.7 5.2 20.1 5.2 30.5v1.6c0 25.8-20.9 46.7-46.7 46.7c-11.5 0-22.9-1.4-34-4.2l-88-22c-15.3-3.8-31.3-3.8-46.6 0l-88 22c-11.1 2.8-22.5 4.2-34 4.2C84.9 480 64 459.1 64 433.3v-1.6c0-10.4 1.6-20.8 5.2-30.5zM421.8 282.7c-24.5-14-29.1-51.7-10.2-84.1s54-47.3 78.5-33.3s29.1 51.7 10.2 84.1s-54 47.3-78.5 33.3zM310.1 189.7c-32.3-10.6-46.9-53.9-32.6-96.8s52.1-69.1 84.4-58.5s46.9 53.9 32.6 96.8s-52.1 69.1-84.4 58.5z"></path>
                    </svg>
                `;
            }
            if (
                normalized.includes("instantáneo")
                || normalized.includes("instant")
                || normalized.includes("conjuro")
                || normalized.includes("sorcery")
                || normalized.includes("hechizo")
                || normalized.includes("spell")
            ) {
                return `
                    <svg class="fa-inline-icon tcg-spell-icon" aria-hidden="true" focusable="false" viewBox="0 0 576 512">
                        <path fill="currentColor" d="M0 80v48c0 17.7 14.3 32 32 32H48 96V80c0-26.5-21.5-48-48-48S0 53.5 0 80zM112 32c10 13.4 16 30 16 48V384c0 35.3 28.7 64 64 64s64-28.7 64-64v-5.3c0-32.4 26.3-58.7 58.7-58.7H480V128c0-53-43-96-96-96H112zM464 480c61.9 0 112-50.1 112-112c0-8.8-7.2-16-16-16H314.7c-14.7 0-26.7 11.9-26.7 26.7V384c0 53-43 96-96 96H368h96z"></path>
                    </svg>
                `;
            }
        }

        if (
            normalized.includes("encantamiento")
            || normalized.includes("enchantment")
            || normalized.includes("apoyo")
            || normalized.includes("support")
        ) {
            return `
                <svg class="tcg-support-icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
                    <path fill="currentColor" d="M32 4C34 20 44 30 60 32 44 34 34 44 32 60 30 44 20 34 4 32 20 30 30 20 32 4Z"></path>
                </svg>
            `;
        }

        const entry = Object.entries(typeSymbols).find(([name]) => normalized.includes(name));
        return entry ? entry[1] : "◆";
    }

    function factionSymbol() {
        if (theme === "uprising_of_the_graveless") {
            return `
                <svg class="tcg-faction-icon tcg-faction-icon--headstone" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
                    <path fill="currentColor" d="M12 57v-7h6V25C18 13.4 23.7 7 32 7c8.3 0 14 6.4 14 18v25h6v7H12Z"></path>
                    <path class="tcg-headstone-chip" d="m38 10 9 10-8 6-5-10 4-6Z"></path>
                    <path class="tcg-headstone-crack" d="m31 9-3 14 7 5-7 10 5 12" fill="none"></path>
                    <path class="tcg-headstone-soil" d="M7 57h50M15 61h34" fill="none"></path>
                </svg>
            `;
        }

        if (theme === "legion_of_varka") {
            return `
                <svg class="tcg-faction-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                    <path fill="currentColor" fill-rule="evenodd" d="M15.362 5.214A8.252 8.252 0 0 1 12 21a8.25 8.25 0 0 1-5.962-13.953A8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3.001 2.48ZM12 18a3.75 3.75 0 0 0 .495-7.467 5.99 5.99 0 0 0-3.252 5.032A3.75 3.75 0 0 0 12 18Z" clip-rule="evenodd"></path>
                </svg>
            `;
        }

        if (theme === "court_of_the_crimson_eclipse") {
            return `
                <svg class="tcg-faction-icon tcg-faction-icon--eclipse" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
                    <path fill="currentColor" fill-rule="evenodd" d="M43.8 7.2A26 26 0 1 0 57 50.1 22 22 0 1 1 43.8 7.2Z" clip-rule="evenodd"></path>
                    <circle class="tcg-faction-gem" cx="18" cy="37" r="6.5"></circle>
                    <path class="tcg-faction-gem-glint" d="M15.2 34.2a4 4 0 0 1 3.5-1.2" fill="none"></path>
                </svg>
            `;
        }

        if (theme === "hunters") {
            return `
                <svg class="tcg-faction-icon tcg-faction-icon--hunters" aria-hidden="true" focusable="false" viewBox="0 0 64 64">
                    <path fill="currentColor" fill-rule="evenodd" d="M32 4 43 20l17 4-11 13 2 19-19-8-19 8 2-19L4 24l17-4L32 4Zm0 11-6 10-11 3 7 7-1 11 11-5 11 5-1-11 7-7-11-3-6-10Z" clip-rule="evenodd"></path>
                    <path fill="currentColor" d="m11 8 6 2 6 12-7 3L11 8Zm42 0-5 17-7-3 6-12 6-2Z"></path>
                </svg>
            `;
        }

        return "";
    }

    function isFullArt(card) {
        return Boolean(card.fullArt);
    }

    function placeholderDataUrl(cardName) {
        const safeName = escapeHtml(cardName || "Sin arte");
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="900" height="560">
                <defs>
                    <radialGradient id="g">
                        <stop offset="0" stop-color="#55473d"/>
                        <stop offset="1" stop-color="#121011"/>
                    </radialGradient>
                </defs>
                <rect width="900" height="560" fill="url(#g)"/>
                <path d="M0 430 Q220 330 450 430 T900 420 V560 H0Z" fill="#000" opacity=".34"/>
                <text x="450" y="278" text-anchor="middle" fill="#d5c79e"
                    font-family="Georgia,serif" font-size="36">${safeName}</text>
                <text x="450" y="326" text-anchor="middle" fill="#8e8375"
                    font-family="Arial,sans-serif" font-size="20">Añade art_crop al JSON</text>
            </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    /*
     * Encuadre por carta. Devuelve "" cuando la carta no tiene ajustes, y en ese caso
     * el atributo style ni siquiera se escribe: el DOM queda idéntico al de siempre.
     */
    function artTransform(card) {
        const frame = card.art_frame;
        if (!frame) return "";
        const zoom = Number(frame.zoom ?? 1);
        const x = Number(frame.x ?? 0);
        const y = Number(frame.y ?? 0);
        if (zoom === 1 && x === 0 && y === 0) return "";
        return `translate(${x}px, ${y}px) scale(${zoom})`;
    }

    /*
     * object-fit: cover recorta la imagen antes de aplicar transform. Eso hace que un zoom
     * menor que 1 sólo encoja el recorte y nunca revele la ilustración completa. Conservamos
     * exactamente el encuadre cover en 1×, pero dimensionamos el bitmap real para que al
     * alejarlo aparezcan de nuevo sus bordes naturales.
     */
    function positionArtImage(image, fullArt) {
        const sourceWidth = image.naturalWidth;
        const sourceHeight = image.naturalHeight;
        if (!sourceWidth || !sourceHeight) return;

        const coverScale = Math.max(CARD_WIDTH / sourceWidth, CARD_HEIGHT / sourceHeight);
        const width = sourceWidth * coverScale;
        const height = sourceHeight * coverScale;
        const verticalAnchor = fullArt ? 0.2 : 0.18;

        image.style.setProperty("--art-base-width", `${width}px`);
        image.style.setProperty("--art-base-height", `${height}px`);
        image.style.setProperty("--art-base-left", `${(CARD_WIDTH - width) * 0.5}px`);
        image.style.setProperty("--art-base-top", `${(CARD_HEIGHT - height) * verticalAnchor}px`);
        image.classList.add("tcg-art-image--positioned");
    }

    function applyDeckMotif(motif) {
        if (!motif) return;
        for (const [slot, values] of Object.entries(motif)) {
            if (!values) continue;
            const x = Number(values.x ?? 0);
            const y = Number(values.y ?? 0);
            if (x !== 0) body.style.setProperty(`--motif-${slot}-x`, `${x}px`);
            if (y !== 0) body.style.setProperty(`--motif-${slot}-y`, `${y}px`);
            if (values.zoom !== undefined && values.zoom !== null) {
                body.style.setProperty(`--motif-${slot}-size`, `${Number(values.zoom) * 100}% auto`);
            }
            if (values.rotation !== undefined && values.rotation !== null) {
                body.style.setProperty(
                    `--motif-${slot}-rotation`,
                    `${Number(values.rotation)}deg`
                );
            }
        }
    }

    function normalizeCards(payload) {
        if (Array.isArray(payload)) return payload;
        if (payload && Array.isArray(payload.cards)) return payload.cards;
        throw new Error("El JSON debe ser un arreglo de cartas o un objeto con cards[].");
    }

    function renderCards(cards) {
        container.replaceChildren();

        if (!cards.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "El JSON no contiene cartas.";
            container.appendChild(empty);
            if (status) status.innerHTML = "<strong>0 cartas</strong>";
            return;
        }

        cards.forEach((card, index) => {
            const cardId = String(card.id || `carta_${index + 1}`);
            const cardName = String(card.nombre || card.name || cardId);
            const type = String(card.tipo || "Carta");
            const effect = String(card.desc || "");
            const lore = String(card.lore || "");
            const noAdditionalEffect = /^(?:sin efecto (?:activo )?adicional|no additional effect)\.$/iu
                .test(effect.trim());
            const hasEffect = effect.trim() !== "" && !noAdditionalEffect;
            const hasLore = card.showFlavorText !== false && lore.trim() !== "";
            const hasStats = card.atk !== null && card.atk !== undefined
                && card.def !== null && card.def !== undefined;
            const fullArt = isFullArt(card);
            const headerFade = card.headerFade !== false;
            const isToken = Boolean(card.isToken);
            const isChronicle = Boolean(card.isChronicle);
            const isEnergy = Boolean(card.isEnergy);
            const isHordeDeck =
                theme === "uprising_of_the_graveless" || theme === "legion_of_varka";
            const showCost = !isHordeDeck
                && card.costo !== null
                && card.costo !== undefined
                && !isToken
                && !isEnergy;
            const showEffect = hasEffect && !isToken && !isEnergy;
            const showLore = hasLore && !isToken && !isEnergy;
            const number = String(index + 1).padStart(3, "0");
            const collectorId = String(card.collectorId || `${setCode}${number}`);
            const artist = String(card.artist || "").trim();
            const art = String(card.art_crop || "");
            const artStyle = artTransform(card);
            const textWeight = effect.length + (showLore ? lore.length * 0.72 : 0);
            const densityClass = textWeight >= 430
                ? " tcg-card--dense"
                : textWeight >= 300
                    ? " tcg-card--compact"
                    : "";
            const titleClass = cardName.length >= 31
                ? " tcg-title--long"
                : cardName.length >= 24
                    ? " tcg-title--medium"
                    : "";
            const variantClass = fullArt ? " tcg-card--full-art" : " tcg-card--common";
            const headerFadeClass = !fullArt && !headerFade ? " tcg-card--no-header-fade" : "";
            const tokenClass = isToken ? " tcg-card--token" : "";
            const energyClass = isEnergy ? " tcg-card--energy" : "";
            const noCostClass = showCost ? "" : " tcg-card--no-cost";
            const metadata = `${escapeHtml(collectorId)} ${footerSeparator} © 2026 HOSTFALL`;
            const artCredit = artist
                ? `<div class="tcg-art-credit" aria-label="Ilustración: ${escapeHtml(artist)}"><svg class="tcg-art-credit-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m5.5 17 4.2-4.2 2.8 2.8 2.2-2.2 3.8 3.6"></path></svg><span class="tcg-art-credit-name">${escapeHtml(artist)}</span></div>`
                : "";
            const stats = hasStats
                ? `<div class="tcg-stats-badge" aria-label="${escapeHtml(`${card.atk} Fuerza, ${card.def} Aguante`)}"><span class="tcg-stat-val">${escapeHtml(card.atk)}</span><span class="tcg-stat-sep">/</span><span class="tcg-stat-val">${escapeHtml(card.def)}</span></div>`
                : "";
            const typeband = `<div class="tcg-typeband"><span class="tcg-type-icon" aria-hidden="true">${typeSymbol(type)}</span><span class="tcg-type-label">${escapeHtml(type)}</span></div>`;
            const effectMarkup = showEffect
                ? `<p class="tcg-effect">${formatEffectText(effect)}</p>`
                : "";
            const flavorMarkup = showLore
                ? `<p class="tcg-flavor">${escapeHtml(lore)}</p>`
                : "";

            const cardElement = document.createElement("article");
            cardElement.className = `tcg-card${variantClass}${headerFadeClass}${tokenClass}${energyClass}${noCostClass}${densityClass}`;
            cardElement.id = `card-${cardId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            cardElement.dataset.cardId = cardId;

            cardElement.innerHTML = `
                <div class="tcg-art-frame">
                    <img
                        class="tcg-art-image"
                        src="${escapeHtml(art || placeholderDataUrl(cardName))}"
                        alt="${escapeHtml(cardName)}"
                        ${artStyle ? `style="--art-transform: ${artStyle}"` : ""}
                    >
                </div>
                <div class="tcg-card-veil"></div>
                ${fullArt ? '<div class="tcg-watermark" aria-hidden="true">H</div>' : '<div class="tcg-card-frame"></div>'}
                <div class="tcg-card-rim"></div>

                <header class="tcg-head">
                    <h2 class="tcg-title${titleClass}">
                        ${escapeHtml(cardName)}
                    </h2>
                    <div class="tcg-seal" aria-hidden="true">${deckSeal()}</div>
                </header>
                ${showCost ? `<div class="tcg-cost-gem"><span data-cost="${escapeHtml(card.costo)}">${escapeHtml(card.costo)}</span></div>` : ""}

                <div class="tcg-lower">
                    ${stats}
                    ${typeband}
                    ${fullArt ? `
                        <div class="tcg-copy">
                            ${effectMarkup}
                            ${showEffect && showLore ? '<div class="tcg-divider"></div>' : ""}
                            ${flavorMarkup}
                        </div>
                        <div class="tcg-meta-row">
                            <div class="tcg-full-art-footer">${metadata}</div>
                            ${artCredit}
                        </div>
                    ` : `
                        <div class="tcg-textplate">
                            <div class="tcg-copy">
                                ${effectMarkup}
                                ${showEffect && showLore ? '<div class="tcg-divider"></div>' : ""}
                                ${flavorMarkup}
                            </div>
                            <div class="tcg-footer-info">${metadata}</div>
                            ${artCredit}
                        </div>
                    `}
                </div>
            `;

            const image = cardElement.querySelector(".tcg-art-image");
            image.addEventListener("load", () => positionArtImage(image, fullArt));
            image.addEventListener(
                "error",
                () => {
                    image.src = placeholderDataUrl(cardName);
                },
                { once: true }
            );
            if (image.complete) positionArtImage(image, fullArt);

            container.appendChild(cardElement);
        });

        if (status) status.innerHTML = `<strong>${cards.length} cartas</strong> · deck completo`;
    }

    function readGeneratedCards() {
        try {
            const localized = generatedData?.cardsByLanguage?.[language]
                ?? generatedData?.cardsByLanguage?.[defaultLanguage]
                ?? generatedData;
            return normalizeCards(localized);
        } catch (error) {
            console.error(error);
            if (status) status.textContent = `No se pudieron leer los datos generados: ${error.message}`;
            return [];
        }
    }

    document.querySelectorAll(".zoom-button").forEach((button) => {
        button.addEventListener("click", () => {
            const scale = button.dataset.scale;
            container.className = `cards-grid scale-${scale}`;
            document.querySelectorAll(".zoom-button").forEach((candidate) => {
                candidate.classList.toggle("is-active", candidate === button);
            });
        });
    });

    applyDeckMotif(window.HostfallDeckMotif);
    renderCards(readGeneratedCards());

    window.HostfallStudio = {
        renderCards,
        applyDeckMotif,
        readGeneratedCards,
        language,
        languages
    };
})();
