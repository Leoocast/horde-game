(() => {
    "use strict";

    const KEYWORD_PATTERN =
        /\b(?:Daña primero|Daño primero|Doble golpe|Robo de vida|Toque mortal|Escurridizo|Vigilancia|Amenaza|Volar|Vuelo|Alcance|Arrollar|Prisa|Antimaleficio|Indestructible|Tóxico(?:\s+\d+)?|Guardia aérea|Alerta|Imponente|Letal|Reflejos|Furtivo|Drenar|Veneno(?:\s+\d+)?|Desborde|Ímpetu)\b/giu;
    const TOKEN_CREATION_PATTERN =
        /\b(?:crea|crear|invoca|invocar)\s+(?:(?:un(?:a)?|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|esa cantidad de|\d+)\s+)[^.!?;:\r\n]*?\d+\/\d+(?:\s+atacando)?/giu;
    const COUNTER_PATTERN =
        /\b(?:(?:un(?:a)?|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|esa cantidad de|\d+)\s+)?contador(?:es)?(?:\s+(?:de\s+[\p{L}\p{M}-]+|[+-]\d+\/[+-]\d+))?/giu;
    const STAT_PATTERN = /[+-]\d+\/[+-]\d+/g;
    const NAMED_STAT_PATTERN = /[+-]\d+\s+de\s+(?:Fuerza|Aguante)/giu;
    const DANGER_PATTERN = /\b(?:fuerza \d+ o menos|\d+ de daño)\b/giu;
    const ACTION_PATTERN = /\bAgota\b/giu;
    const LIFE_PAYMENT_PATTERN =
        /\bPaga\s+(?:\d+\s+(?:vidas|de\s+Vida)|la mitad de (?:tus vidas|tu Vida))\.?/giu;
    const INLINE_KEYWORD_SEPARATOR_PATTERN =
        /(\b(?:Volar|Robo de vida|Vigilancia|Drenar|Alerta)\.)\s+(?=(?:Volar|Robo de vida|Vigilancia|Drenar|Alerta)\.)/giu;
    const SEQUENTIAL_EFFECT_BREAK_PATTERN =
        /\s+y\s+luego\s+(?=(?:crea|invoca|lucha)\b)/giu;
    const SENTENCE_BREAK_PATTERN = /([.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ])/gu;

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function strong(className, value) {
        return `<strong class="${className}">${value}</strong>`;
    }

    function keywordStrong(value) {
        const withValueBadge = value.replace(
            /^((?:Tóxico|Veneno)\s+)(\d+)$/iu,
            '$1<span class="effect-keyword-value">$2</span>',
        );
        return strong("effect-keyword", withValueBadge);
    }

    function formatInlineText(value, options) {
        let html = escapeHtml(value);
        const protectedHtml = [];

        const protect = (pattern, render) => {
            pattern.lastIndex = 0;
            html = html.replace(pattern, (match) => {
                const marker = `\uE000${protectedHtml.length}\uE001`;
                protectedHtml.push(render(match));
                return marker;
            });
        };

        if (options.tapIconHtml) {
            protect(/\{\{T\}\}/g, () => options.tapIconHtml);
        }
        if (options.energyIconHtml) {
            protect(/\{(?:G|E|R|B)\}/g, () => options.energyIconHtml);
        }

        protect(TOKEN_CREATION_PATTERN, (match) => strong("effect-token", match));
        protect(COUNTER_PATTERN, (match) => strong("effect-counter", match));
        protect(KEYWORD_PATTERN, keywordStrong);
        protect(ACTION_PATTERN, (match) => strong("effect-action", match));
        protect(LIFE_PAYMENT_PATTERN, (match) => strong("effect-life-cost", match));
        protect(DANGER_PATTERN, (match) => strong("effect-danger", match));
        protect(NAMED_STAT_PATTERN, (match) => strong("effect-stat", match));
        protect(STAT_PATTERN, (match) => strong("effect-stat", match));

        return html.replace(
            /\uE000(\d+)\uE001/g,
            (_marker, index) => protectedHtml[Number(index)] ?? "",
        );
    }

    function formatEffectText(value, options = {}) {
        const paragraphs = String(value ?? "")
            .trim()
            .replace(INLINE_KEYWORD_SEPARATOR_PATTERN, "$1\uE100")
            .replace(SEQUENTIAL_EFFECT_BREAK_PATTERN, ".\nLuego ")
            .replace(SENTENCE_BREAK_PATTERN, "$1\n")
            .split(/\r?\n+/)
            .map((paragraph) => paragraph.replaceAll("\uE100", " ").trim())
            .filter(Boolean);

        return paragraphs
            .map(
                (paragraph) =>
                    `<span class="effect-paragraph">${formatInlineText(paragraph, options)}</span>`,
            )
            .join("");
    }

    window.HostfallCardText = Object.freeze({
        escapeHtml,
        formatEffectText,
    });
})();
