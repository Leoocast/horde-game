(() => {
    "use strict";

    const body = document.body;
    const container = document.getElementById("cards-container");
    const status = document.getElementById("studio-status");
    const embeddedData = document.getElementById("deck-data");
    const setCode = (body.dataset.setCode || "HFX").toUpperCase();
    const theme = body.dataset.theme || "";

    const typeSymbols = {
        criatura: "♞",
        enchantment: "✦",
        encantamiento: "✦",
        instant: "✧",
        instantáneo: "✧",
        sorcery: "☄",
        conjuro: "☄",
        energía: "◆",
        energy: "◆",
        tierra: "▲",
        land: "▲"
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatEffectText(value) {
        let formatted = escapeHtml(value || "");
        formatted = formatted.replace(
            /\{\{T\}\}/g,
            '<span class="symbol-badge symbol-tap" title="Agotar / Activar"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i></span>'
        );
        formatted = formatted.replace(
            /\{(?:G|E|R|B)\}/g,
            '<span class="symbol-badge symbol-energy" title="Energía">ϟ</span>'
        );
        formatted = formatted.replace(
            /(\+\d+\/\+\d+|-\d+\/-\d+)/g,
            '<strong class="effect-buff">$1</strong>'
        );
        formatted = formatted.replace(
            /\b(dos|tres) Trasgos 1\/1\b/gi,
            '<strong class="effect-token">$&</strong>'
        );
        formatted = formatted.replace(
            /(Daña primero|Robo de vida|Toque mortal|Escurridizo|Vigilancia|Amenaza|Volar)/g,
            '<strong class="effect-keyword">$1</strong>'
        );
        return formatted.replace(/\r?\n/g, "<br>");
    }

    function typeSymbol(type) {
        const normalized = String(type || "").toLocaleLowerCase("es");

        if (theme === "zombies" || theme === "goblins" || theme === "vampires") {
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
            ) {
                return `
                    <svg class="fa-inline-icon tcg-spell-icon" aria-hidden="true" focusable="false" viewBox="0 0 576 512">
                        <path fill="currentColor" d="M0 80v48c0 17.7 14.3 32 32 32H48 96V80c0-26.5-21.5-48-48-48S0 53.5 0 80zM112 32c10 13.4 16 30 16 48V384c0 35.3 28.7 64 64 64s64-28.7 64-64v-5.3c0-32.4 26.3-58.7 58.7-58.7H480V128c0-53-43-96-96-96H112zM464 480c61.9 0 112-50.1 112-112c0-8.8-7.2-16-16-16H314.7c-14.7 0-26.7 11.9-26.7 26.7V384c0 53-43 96-96 96H368h96z"></path>
                    </svg>
                `;
            }
        }

        if (normalized.includes("encantamiento") || normalized.includes("enchantment")) {
            return '<span class="tcg-enchantment-icon">✦</span>';
        }

        const entry = Object.entries(typeSymbols).find(([name]) => normalized.includes(name));
        return entry ? entry[1] : "◆";
    }

    function factionSymbol() {
        if (theme === "goblins") {
            return `
                <svg class="tcg-faction-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                    <path fill="currentColor" fill-rule="evenodd" d="M15.362 5.214A8.252 8.252 0 0 1 12 21a8.25 8.25 0 0 1-5.962-13.953A8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3.001 2.48ZM12 18a3.75 3.75 0 0 0 .495-7.467 5.99 5.99 0 0 0-3.252 5.032A3.75 3.75 0 0 0 12 18Z" clip-rule="evenodd"></path>
                </svg>
            `;
        }

        if (theme === "vampires") {
            return `
                <svg class="tcg-faction-icon tcg-faction-icon--blood" aria-hidden="true" focusable="false" viewBox="0 0 384 512">
                    <path fill="currentColor" d="M192 0C79.9 95.2 0 213.9 0 320c0 106 86 192 192 192s192-86 192-192C384 213.9 304.1 95.2 192 0Z"></path>
                </svg>
            `;
        }

        return "";
    }

    function isFullArt(card) {
        const type = String(card.tipo || "").toLocaleLowerCase("es");
        const description = String(card.desc || "").trim().toLocaleLowerCase("es");
        const isHordeToken =
            (theme === "zombies" || theme === "goblins")
            && Boolean(card.isToken);
        const isVanillaHordeCreature =
            (theme === "zombies" || theme === "goblins")
            && type.includes("criatura")
            && description === "sin efecto adicional.";
        return type.includes("tierra")
            || type.includes("energía")
            || isHordeToken
            || isVanillaHordeCreature;
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
            status.innerHTML = "<strong>0 cartas</strong>";
            return;
        }

        cards.forEach((card, index) => {
            const cardId = String(card.id || `carta_${index + 1}`);
            const cardName = String(card.nombre || card.name || cardId);
            const type = String(card.tipo || "Carta");
            const effect = String(card.desc || "");
            const lore = String(card.lore || "");
            const noAdditionalEffect =
                effect.trim().toLocaleLowerCase("es") === "sin efecto adicional.";
            const hasEffect = effect.trim() !== "" && !noAdditionalEffect;
            const hasLore = lore.trim() !== "";
            const hasStats = card.atk !== null && card.atk !== undefined
                && card.def !== null && card.def !== undefined;
            const fullArt = isFullArt(card);
            const isHordeDeck =
                theme === "zombies" || theme === "goblins";
            const showCost = !isHordeDeck
                && !fullArt
                && card.costo !== null
                && card.costo !== undefined
                && !card.isToken;
            const number = String(index + 1).padStart(3, "0");
            const quantity = Number(card.cantidad || card.quantity || 0);
            const art = String(card.art_crop || "");
            const titleClass = cardName.length >= 31
                ? " tcg-title--long"
                : cardName.length >= 24
                    ? " tcg-title--medium"
                    : "";

            const cardElement = document.createElement("article");
            cardElement.className = `tcg-card${fullArt ? " tcg-card--full-art" : ""}`;
            cardElement.id = `card-${cardId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            cardElement.dataset.cardId = cardId;

            cardElement.innerHTML = `
                <div class="tcg-outer-border"></div>
                <div class="tcg-inner">
                    <header class="tcg-head">
                        ${showCost ? `
                            <div class="tcg-cost tcg-mana-gem">
                                <span data-cost="${escapeHtml(card.costo)}">${escapeHtml(card.costo)}</span>
                            </div>
                        ` : ""}
                        <div class="tcg-title-wrap">
                            <div class="tcg-title${titleClass}">${escapeHtml(cardName)}</div>
                            <div class="tcg-faction-seal tcg-element-icon" aria-hidden="true">${factionSymbol()}</div>
                        </div>
                    </header>

                    <div class="tcg-art-frame">
                        <img
                            class="tcg-art-image"
                            src="${escapeHtml(art || placeholderDataUrl(cardName))}"
                            alt="${escapeHtml(cardName)}"
                        >
                    </div>

                    <div class="tcg-typeband">
                        <div class="tcg-type-text">
                            <span class="tcg-type-icon" aria-hidden="true">${typeSymbol(type)}</span>
                            <span>${escapeHtml(type)}</span>
                        </div>
                    </div>

                    <div class="tcg-body">
                        ${hasEffect ? `<p class="tcg-effect">${formatEffectText(effect)}</p>` : ""}
                        ${hasEffect && hasLore ? '<div class="tcg-divider"></div>' : ""}
                        ${hasLore ? `<p class="tcg-flavor">${escapeHtml(lore)}</p>` : ""}
                        ${!hasEffect && !hasLore ? '<div class="tcg-empty-mark" aria-hidden="true"></div>' : ""}
                        <div class="tcg-footer-info">${setCode} #${number} · Hostfall TCG</div>
                    </div>
                </div>

                ${quantity > 1 ? `<div class="tcg-quantity">×${quantity}</div>` : ""}
                ${hasStats ? `
                    <div class="tcg-stats-badge" aria-label="${escapeHtml(`${card.atk} ataque, ${card.def} defensa`)}">
                        <div class="tcg-stat-item tcg-stat-atk">
                            <span class="tcg-stat-val">${escapeHtml(card.atk)}</span>
                        </div>
                        <span class="tcg-stat-sep">/</span>
                        <div class="tcg-stat-item tcg-stat-def">
                            <span class="tcg-stat-val">${escapeHtml(card.def)}</span>
                        </div>
                    </div>
                ` : ""}
            `;

            const image = cardElement.querySelector(".tcg-art-image");
            image.addEventListener(
                "error",
                () => {
                    image.src = placeholderDataUrl(cardName);
                },
                { once: true }
            );

            container.appendChild(cardElement);
        });

        status.innerHTML = `<strong>${cards.length} cartas</strong> · deck completo`;
    }

    function readEmbeddedCards() {
        if (!embeddedData) return [];
        try {
            return normalizeCards(JSON.parse(embeddedData.textContent));
        } catch (error) {
            console.error(error);
            status.textContent = `No se pudo leer el ejemplo incluido: ${error.message}`;
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

    renderCards(readEmbeddedCards());
})();
