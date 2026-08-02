/*
 * Servidor local del Card Studio.
 *
 * Existe por una sola razón: una página abierta con file:// no puede escribir en disco.
 * El estudio necesita guardar studio.config.json y dejar el arte cargado en
 * public/cards/<deck>/art/, así que este proceso hace de puente. No sirve para nada más:
 * escucha sólo en 127.0.0.1 y no toca la exportación, que sigue leyendo los index.html.
 *
 *   node dev/tools/Decks/studio-server.cjs
 *   http://127.0.0.1:5178/dev/tools/Decks/studio.html
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DECKS_DIR = path.join(ROOT, 'dev', 'tools', 'Decks');
const PORT = Number(process.env.HOSTFALL_STUDIO_PORT || 5178);
const HOST = '127.0.0.1';
const CARD_ID = /^[a-zA-Z0-9_-]+$/;
const ART_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);
const MAX_ART_BYTES = 32 * 1024 * 1024;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
};

let studioData = null;

async function loadStudioData() {
    if (!studioData) {
        studioData = await import(
            pathToFileURL(path.join(ROOT, 'scripts', 'card-studio-data.mjs')).href
        );
    }
    return studioData;
}

function deckDirectory(deckId) {
    return path.join(DECKS_DIR, deckId);
}

function configPath(deckId) {
    return path.join(deckDirectory(deckId), 'studio.config.json');
}

function readConfig(deckId) {
    return JSON.parse(fs.readFileSync(configPath(deckId), 'utf8'));
}

/*
 * Conserva el fin de línea que ya tenía el archivo. El repo usa core.autocrlf,
 * así que reescribirlo con LF a ciegas produciría un diff de archivo completo.
 */
function writeConfig(deckId, config) {
    const filePath = configPath(deckId);
    const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const newline = previous.includes('\r\n') ? '\r\n' : '\n';
    const serialized = `${JSON.stringify(config, null, 2)}\n`;
    fs.writeFileSync(filePath, newline === '\n' ? serialized : serialized.replace(/\n/g, '\r\n'));
}

/* hunters guarda la presentación completa con claves snake_case; los demás usan artCrop. */
function artKey(card) {
    return Object.hasOwn(card, 'art_crop') ? 'art_crop' : 'artCrop';
}

async function assertKnownDeck(deckId) {
    const { STUDIO_DECKS } = await loadStudioData();
    if (!Object.hasOwn(STUDIO_DECKS, deckId)) {
        throw new HttpError(400, `Deck desconocido "${deckId}".`);
    }
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function sendJson(response, status, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    response.end(body);
}

function readBody(request, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new HttpError(413, 'El archivo supera el límite permitido.'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks)));
        request.on('error', reject);
    });
}

/* Título legible del deck, tomado del index.html que ya existe. */
function deckTitle(deckId) {
    const indexPath = path.join(deckDirectory(deckId), 'index.html');
    if (!fs.existsSync(indexPath)) return deckId;
    const html = fs.readFileSync(indexPath, 'utf8');
    const title = html.match(/<h1 class="studio-title">([^<]*)<\/h1>/);
    return title ? title[1].trim() : deckId;
}

async function listDecks() {
    const { STUDIO_DECKS, buildStudioCards, studioMotif, syncStudioData } = await loadStudioData();

    /*
     * La lista lee el JSON runtime en vivo, pero el index.html del preview lee
     * deck-data.generated.js. Sin este paso, editar un nombre o un coste en
     * src/data/decks/ se vería en la lista y no en la carta. Sólo escribe si algo cambió.
     */
    const regenerated = syncStudioData();

    const decks = Object.keys(STUDIO_DECKS).map((deckId) => {
        const config = readConfig(deckId);
        const presentationById = new Map(config.cards.map((card) => [card.id, card]));
        const cards = buildStudioCards(deckId).map((card) => {
            const presentation = presentationById.get(card.id) ?? {};
            return {
                id: card.id,
                collectorId: card.collectorId ?? null,
                nombre: card.nombre,
                tipo: card.tipo,
                artCrop: card.art_crop ?? null,
                artFrame: presentation.artFrame ?? null,
            };
        });
        return {
            id: deckId,
            title: deckTitle(deckId),
            indexUrl: `/dev/tools/Decks/${deckId}/index.html`,
            previewOnly: Boolean(config.previewOnly),
            motif: studioMotif(deckId),
            cards,
        };
    });

    return { decks, regenerated };
}

/*
 * Guarda encuadres y motivo, y regenera deck-data.generated.js.
 * El index.html no se toca: la exportación sigue viendo exactamente el mismo documento.
 */
async function saveDeck(payload) {
    const deckId = String(payload.deck || '');
    await assertKnownDeck(deckId);

    const { syncStudioData } = await loadStudioData();
    const config = readConfig(deckId);
    const frames = payload.artFrames && typeof payload.artFrames === 'object'
        ? payload.artFrames
        : {};
    const known = new Set(config.cards.map((card) => card.id));

    for (const cardId of Object.keys(frames)) {
        if (!known.has(cardId)) {
            throw new HttpError(400, `${deckId} no contiene la carta "${cardId}".`);
        }
    }

    config.cards = config.cards.map((card) => {
        if (!Object.hasOwn(frames, card.id)) return card;
        const frame = frames[card.id];
        const next = { ...card };
        if (frame === null) delete next.artFrame;
        else next.artFrame = frame;
        return next;
    });

    if (Object.hasOwn(payload, 'motif')) {
        if (payload.motif === null) delete config.motif;
        else config.motif = payload.motif;
    }

    writeConfig(deckId, config);

    /* Valida el schema y deja deck-data.generated.js al día; si algo no cuadra, revierte. */
    try {
        syncStudioData({ deckIds: [deckId] });
    } catch (error) {
        throw new HttpError(400, error.message);
    }

    return { ok: true, deck: deckId };
}

async function saveArt(request, url) {
    const deckId = String(url.searchParams.get('deck') || '');
    const card = String(url.searchParams.get('card') || '');
    const extension = String(url.searchParams.get('ext') || '').toLowerCase().replace(/^\./, '');

    await assertKnownDeck(deckId);
    if (!CARD_ID.test(card)) throw new HttpError(400, `Id de carta inválido: "${card}".`);
    if (!ART_EXTENSIONS.has(extension)) {
        throw new HttpError(400, `Formato no admitido: "${extension}".`);
    }

    const config = readConfig(deckId);
    const target = config.cards.find((entry) => entry.id === card);
    if (!target) throw new HttpError(400, `${deckId} no contiene la carta "${card}".`);

    const bytes = await readBody(request, MAX_ART_BYTES);
    if (bytes.length === 0) throw new HttpError(400, 'El archivo llegó vacío.');

    /*
     * El arte fuente vive en art/, nunca en la raíz de public/cards/<deck>/:
     * esa carpeta guarda los PNG finales y assertIndependentArtSources rechaza la mezcla.
     */
    const artDirectory = path.join(ROOT, 'public', 'cards', deckId, 'art');
    fs.mkdirSync(artDirectory, { recursive: true });
    fs.writeFileSync(path.join(artDirectory, `${card}.${extension}`), bytes);

    const relativeArt = path
        .relative(deckDirectory(deckId), path.join(artDirectory, `${card}.${extension}`))
        .replaceAll(path.sep, '/');
    target[artKey(target)] = relativeArt;
    writeConfig(deckId, config);

    const { syncStudioData } = await loadStudioData();
    syncStudioData({ deckIds: [deckId] });

    return { ok: true, artCrop: relativeArt, bytes: bytes.length };
}

function serveStatic(request, response, url) {
    const decoded = decodeURIComponent(url.pathname);
    const requested = path.join(ROOT, decoded);
    const resolved = path.resolve(requested);

    if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
        sendJson(response, 403, { error: 'Ruta fuera del repositorio.' });
        return;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        sendJson(response, 404, { error: `No existe ${decoded}.` });
        return;
    }

    response.writeHead(200, {
        'content-type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
    });
    fs.createReadStream(resolved).pipe(response);
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);

    try {
        if (url.pathname === '/') {
            response.writeHead(302, { location: '/dev/tools/Decks/studio.html' });
            response.end();
            return;
        }
        if (url.pathname === '/api/decks' && request.method === 'GET') {
            sendJson(response, 200, await listDecks());
            return;
        }
        if (url.pathname === '/api/art' && request.method === 'POST') {
            sendJson(response, 200, await saveArt(request, url));
            return;
        }
        if (url.pathname === '/api/save' && request.method === 'POST') {
            const body = await readBody(request, 1024 * 1024);
            sendJson(response, 200, await saveDeck(JSON.parse(body.toString('utf8'))));
            return;
        }
        if (request.method !== 'GET') {
            sendJson(response, 405, { error: 'Método no permitido.' });
            return;
        }
        serveStatic(request, response, url);
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 500) console.error(error);
        sendJson(response, status, { error: error.message });
    }
});

server.listen(PORT, HOST, () => {
    console.log('Card Studio');
    console.log(`  http://${HOST}:${PORT}/dev/tools/Decks/studio.html`);
    console.log('');
    console.log('Ctrl+C para detenerlo. La exportación no necesita este servidor.');
});
