// Servidor estático mínimo para ver las maquetas de esta carpeta.
// No arranca el juego ni toca el dev server de Vite: sólo sirve archivos de dev/mockups.
//
//   node dev/mockups/serve.mjs    ->  http://127.0.0.1:4321
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize, resolve } from "node:path";

// resolve() deja ROOT con los separadores nativos, para que el prefijo se pueda
// comparar contra lo que devuelve join() en Windows.
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT ?? 4321);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

// Excepción explícita y de sólo lectura. Las maquetas WebGL comparten el Three.js
// del repositorio en vez de vendorizar una copia dentro de dev/mockups; abiertas con
// doble clic les basta la ruta relativa a node_modules, pero servidas por HTTP esa
// ruta cae fuera de ROOT. Sólo se expone este archivo concreto, nunca el directorio.
const ALIASES = new Map([
  ["vendor/three.min.js", resolve(ROOT, "..", "..", "node_modules", "three", "build", "three.min.js")],
  // Mismo trato para el arte del repositorio: las maquetas lo referencian en vez
  // de duplicar el JPG dentro de dev/mockups. Cada archivo se expone uno a uno.
  ["art/util/DeanSpencer-LichScryingOutcropCampDriveThruRPG.jpg",
    resolve(ROOT, "..", "..", "assets", "art", "util", "DeanSpencer-LichScryingOutcropCampDriveThruRPG.jpg")],
  ["art/util/DeanSpencer-spotcol-magicgateFP-nightshade-intensity-LOW-V1.jpg",
    resolve(ROOT, "..", "..", "assets", "art", "util", "DeanSpencer-spotcol-magicgateFP-nightshade-intensity-LOW-V1.jpg")],
]);

createServer(async (req, res) => {
  const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const relative = normalize(requested === "/" ? "/index.html" : requested).replace(/^([/\\])+/, "");

  // normalize() ya colapsó los "..", pero el prefijo se verifica igual antes de leer.
  const alias = ALIASES.get(relative.split("\\").join("/"));
  const target = alias ?? join(ROOT, relative);
  if (!alias && !target.startsWith(ROOT)) {
    res.writeHead(403).end("Fuera de dev/mockups");
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`No encontrado: ${relative}`);
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`maquetas en http://127.0.0.1:${PORT}`);
});
