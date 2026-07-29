const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DECKS = new Set([
    'monogreen',
    'zombies',
    'goblins',
    'vampires'
]);

function requireExporterDependency(name) {
    try {
        return require(name);
    } catch {
        const bundledModules = path.join(
            os.homedir(),
            '.cache',
            'codex-runtimes',
            'codex-primary-runtime',
            'dependencies',
            'node',
            'node_modules'
        );
        return require(path.join(bundledModules, name));
    }
}

function findBrowser() {
    const configuredCandidates = [
        process.env.HOSTFALL_BROWSER_PATH,
        process.env.CHROME_PATH
    ];
    const windowsCandidates = [
        path.join(process.env.PROGRAMFILES_X86 || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES_X86 || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ];
    const macCandidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        path.join(os.homedir(), 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
        path.join(os.homedir(), 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
    ];
    const candidates = [
        ...configuredCandidates,
        ...(process.platform === 'darwin' ? macCandidates : windowsCandidates)
    ];

    return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function pngSize(png) {
    return {
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20)
    };
}

async function writeFileWithRetry(filePath, contents, attempts = 6) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await fs.promises.writeFile(filePath, contents);
            return;
        } catch (error) {
            if (attempt === attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, attempt * 120));
        }
    }
}

async function clearPreviousPngs(outputDir) {
    const entries = await fs.promises.readdir(outputDir, { withFileTypes: true });

    await Promise.all(
        entries
            .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png')
            .map((entry) => fs.promises.unlink(path.join(outputDir, entry.name)))
    );
}

async function preparePage(page, htmlPath) {
    await page.goto(pathToFileURL(htmlPath).href, {
        waitUntil: 'networkidle',
        timeout: 60000
    });

    const brokenImages = await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
            [...document.images].map((img) =>
                img.decode ? img.decode().catch(() => undefined) : Promise.resolve()
            )
        );

        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        document.body.style.backgroundImage = 'none';

        const container = document.getElementById('cards-container');
        if (!container) {
            throw new Error('No se encontro #cards-container en el index del deck.');
        }
        container.className = 'cards-grid scale-100';

        document.querySelectorAll('.tcg-card').forEach((card) => {
            card.style.setProperty('box-shadow', 'none', 'important');
        });

        return [...document.images]
            .filter((img) => !img.complete || img.naturalWidth === 0)
            .map((img) => img.alt || img.src);
    });

    if (brokenImages.length > 0) {
        throw new Error(`No se pudieron cargar estas imagenes: ${brokenImages.join(', ')}`);
    }
}

async function main() {
    const deckId = String(process.argv[2] || '').trim().toLowerCase();

    if (!DECKS.has(deckId)) {
        throw new Error(
            `Deck invalido "${deckId}". Usa: ${[...DECKS].join(', ')}.`
        );
    }

    const { chromium } = requireExporterDependency('playwright');
    const sharp = requireExporterDependency('sharp');
    const executablePath = findBrowser();

    if (!executablePath) {
        throw new Error(
            'No se encontro Google Chrome, Microsoft Edge ni Chromium. '
            + 'Instala uno o define HOSTFALL_BROWSER_PATH con la ruta del ejecutable.'
        );
    }

    const deckDir = path.join(__dirname, deckId);
    const htmlPath = path.join(deckDir, 'index.html');
    const outputDir = path.join(deckDir, 'exported-png');

    if (!fs.existsSync(htmlPath)) {
        throw new Error(`No se encontro el index del deck: ${htmlPath}`);
    }

    await fs.promises.mkdir(outputDir, { recursive: true });

    const browser = await chromium.launch({
        executablePath,
        headless: true
    });

    try {
        const page = await browser.newPage({
            viewport: { width: 1200, height: 1500 },
            deviceScaleFactor: 1
        });

        await preparePage(page, htmlPath);

        const cards = page.locator('.tcg-card');
        const total = await cards.count();

        if (total === 0) {
            throw new Error(`El deck ${deckId} no contiene cartas para exportar.`);
        }

        const exportedIds = new Set();
        const pendingPngs = [];

        for (let index = 0; index < total; index++) {
            const card = cards.nth(index);
            const dataId = await card.getAttribute('data-card-id');
            const domId = await card.getAttribute('id');
            const cardId = dataId || String(domId || '').replace(/^card-/, '');

            if (!/^[a-zA-Z0-9_-]+$/.test(cardId)) {
                throw new Error(`El id "${cardId}" no es valido para usarlo como nombre de archivo.`);
            }
            if (exportedIds.has(cardId)) {
                throw new Error(`El deck contiene el id duplicado "${cardId}".`);
            }
            exportedIds.add(cardId);

            const fileName = `${cardId}.png`;
            const bounds = await card.boundingBox();

            if (!bounds) {
                throw new Error(`No se pudo medir la carta ${cardId}.`);
            }
            if (
                Math.abs(bounds.width - 976) > 1
                || Math.abs(bounds.height - 1360) > 1
            ) {
                throw new Error(
                    `${fileName} mide ${bounds.width}x${bounds.height} en el navegador; `
                    + 'se esperaba aproximadamente 976x1360.'
                );
            }

            /*
             * locator.screenshot() puede redondear un borde subpixel y producir 1361 px.
             * Conservamos la captura completa y recortamos solamente ese pixel adicional;
             * no se reescala ni se altera el contenido de la carta.
             */
            const rawPng = await card.screenshot({
                type: 'png',
                omitBackground: true,
                animations: 'disabled'
            });
            const rawSize = pngSize(rawPng);

            if (
                rawSize.width < 976
                || rawSize.height < 1360
                || rawSize.width > 977
                || rawSize.height > 1361
            ) {
                throw new Error(
                    `${fileName} salio a ${rawSize.width}x${rawSize.height}; `
                    + 'se esperaba 976x1360 con un maximo de 1 px de redondeo.'
                );
            }

            const png = rawSize.width === 976 && rawSize.height === 1360
                ? rawPng
                : await sharp(rawPng)
                    .extract({
                        left: 0,
                        top: 0,
                        width: 976,
                        height: 1360
                    })
                    .png()
                    .toBuffer();
            const size = pngSize(png);

            if (size.width !== 976 || size.height !== 1360) {
                throw new Error(
                    `${fileName} no pudo normalizarse a 976x1360.`
                );
            }

            pendingPngs.push({
                fileName,
                png
            });
        }

        await clearPreviousPngs(outputDir);

        for (let index = 0; index < pendingPngs.length; index++) {
            const { fileName, png } = pendingPngs[index];
            await writeFileWithRetry(path.join(outputDir, fileName), png);
            console.log(`[${index + 1}/${total}] ${fileName}`);
        }

        console.log('');
        console.log(`Listo: ${outputDir}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('');
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
});
