const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

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
    const candidates = [
        path.join(process.env.PROGRAMFILES_X86 || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES_X86 || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
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

async function main() {
    const { chromium } = requireExporterDependency('playwright');
    const JSZip = requireExporterDependency('jszip');
    const executablePath = findBrowser();

    if (!executablePath) {
        throw new Error('No se encontró Microsoft Edge ni Google Chrome.');
    }

    const htmlPath = path.join(__dirname, 'index.html');
    const outputDir = path.join(__dirname, 'exported-png');
    const zipPath = path.join(__dirname, 'mono-green-deck-976x1360-png.zip');

    fs.mkdirSync(outputDir, { recursive: true });

    const browser = await chromium.launch({
        executablePath,
        headless: true
    });

    try {
        const page = await browser.newPage({
            viewport: { width: 1200, height: 1500 },
            deviceScaleFactor: 1
        });

        await page.goto(pathToFileURL(htmlPath).href, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(
                [...document.images].map((img) =>
                    img.decode ? img.decode().catch(() => undefined) : Promise.resolve()
                )
            );
            // Element screenshots include whatever is painted behind rounded corners. Keep the
            // export surface transparent so the PNG preserves the card silhouette instead of
            // baking the deck-builder's dark page background into every corner.
            document.documentElement.style.background = 'transparent';
            document.body.style.background = 'transparent';
            document.body.style.backgroundImage = 'none';
            document.getElementById('cards-container').className = 'cards-grid scale-100';
        });

        const cards = page.locator('.tcg-card');
        const total = await cards.count();
        const zip = new JSZip();

        for (let index = 0; index < total; index++) {
            const card = cards.nth(index);
            const domId = await card.getAttribute('id');
            const cardId = (domId || `card-carta_${index + 1}`).replace(/^card-/, '');
            const cardNumber = String(index + 1).padStart(3, '0');
            const fileName = `${cardNumber}_${cardId}.png`;
            const filePath = path.join(outputDir, fileName);

            const png = await card.screenshot({
                type: 'png',
                omitBackground: true,
                animations: 'disabled'
            });
            const size = pngSize(png);

            if (size.width !== 976 || size.height !== 1360) {
                throw new Error(
                    `${fileName} salió a ${size.width}x${size.height}; se esperaba 976x1360.`
                );
            }

            await writeFileWithRetry(filePath, png);
            zip.file(fileName, png);
            console.log(`[${index + 1}/${total}] ${fileName}`);
        }

        await writeFileWithRetry(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
        console.log('');
        console.log(`Listo: ${zipPath}`);
        console.log(`También quedaron los PNG individuales en: ${outputDir}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error('');
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
});
