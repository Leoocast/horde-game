/*
 * Exporta cada opción a PNG 976x1360 en ./preview.
 * Usa el mismo truco que el exportador del juego para encontrar playwright y
 * un Chrome/Edge instalado, pero no escribe nada dentro del repo.
 *
 *   node render.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function requireDependency(name) {
    try {
        return require(name);
    } catch {
        const bundled = path.join(
            os.homedir(),
            '.cache',
            'codex-runtimes',
            'codex-primary-runtime',
            'dependencies',
            'node',
            'node_modules'
        );
        return require(path.join(bundled, name));
    }
}

function findBrowser() {
    const candidates = [
        process.env.HOSTFALL_BROWSER_PATH,
        process.env.CHROME_PATH,
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ];
    return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function main() {
    const { chromium } = requireDependency('playwright');
    const outputDir = path.join(__dirname, 'preview');
    fs.mkdirSync(outputDir, { recursive: true });

    const executablePath = findBrowser();
    const browser = await chromium.launch(executablePath ? { executablePath } : {});
    const page = await browser.newPage({
        viewport: { width: 1200, height: 2400 },
        deviceScaleFactor: 1
    });

    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href, {
        waitUntil: 'networkidle',
        timeout: 60000
    });

    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
            [...document.images].map((img) => (img.decode ? img.decode().catch(() => undefined) : null))
        );
        document.querySelector('.lab-grid').className = 'lab-grid scale-100';
        document.querySelectorAll('.card').forEach((card) => {
            card.style.setProperty('box-shadow', 'none', 'important');
        });
    });

    for (const id of ['comun', 'cronica']) {
        const element = await page.$(`#card-${id}`);
        const file = path.join(outputDir, `${id}.png`);
        await element.screenshot({ path: file });
        const png = fs.readFileSync(file);
        console.log(`${id}.png · ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
    }

    await browser.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
