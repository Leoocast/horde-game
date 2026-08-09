# Release Windows x64

Contrato operativo de la Fase 5. El paquete final es el directorio
`out/Electron Packages/Hostfall-win32-x64`; SteamPipe deberá recibir únicamente ese directorio.

## Staging allowlist

`scripts/electron-release-assets.mjs` deriva los recursos desde las cuatro manifests runtime de
imágenes, `cardStudioGameArt.generated.json`, las fuentes usadas por `src/styles.css` y
`runtimeAudioAssets.json`. Copia únicamente la proyección resultante a
`.electron-staging/resources`.

La proyección actual contiene:

- 61 PNG finales de cartas;
- 61 artes fuente usados por el recorte del campo;
- 57 archivos de audio;
- 6 fuentes WOFF2.

Hunters, Card Studio, `exported-png`, archivos de autoría y assets no referenciados quedan fuera.
Los JSON authored y generated que importa el juego se compilan dentro del renderer; no se copian
como contenido mutable.

## Layout del artefacto

```text
Hostfall-win32-x64/
  Hostfall.exe
  LICENSE
  LICENSES.chromium.html
  resources/
    app.asar
    THIRD_PARTY_NOTICES.txt
    audio/
    cards/
    fonts/
```

`app.asar` contiene exclusivamente main, preload, HTML, JavaScript, CSS y assets pequeños de UI.
No contiene audio, cartas, fuentes, source maps, fuentes TypeScript, tests ni tooling developer.
Los fuses obligan a cargar la aplicación desde el ASAR íntegro.

## Comandos

```bash
pnpm electron:stage
pnpm electron:package
pnpm electron:verify
pnpm electron:smoke
pnpm electron:repro
pnpm electron:delta
pnpm electron:release:audit
```

`electron:package` genera notices y staging antes de Forge, y escribe un manifest hermano del
directorio con path, tamaño y SHA-256. `electron:repro` crea dos paquetes unsigned y exige
inventarios y hashes idénticos. `electron:delta` simula una modificación aislada de una carta y
demuestra que cambia un solo recurso, sin tocar `app.asar`.

## Firma e icono

La comparación reproducible siempre se ejecuta antes de firmar. La firma no se configurará hasta
que el owner entregue la identidad legal y el certificado de code signing; esos secretos nunca se
guardan en el repo. Falta también aprobar un `.ico` final multirresolución en `build/icon.ico`.
La aprobación pública de identidad se registra sin secretos en `docs/windows_signing.json`; el
certificado y sus credenciales se inyectan sólo desde el entorno seguro de release.

## Gates comerciales pendientes

`electron:release:audit` falla deliberadamente mientras exista cualquiera de estos casos:

- los 61 PNG no se hayan reexportado desde el Card Studio vigente;
- queden sonidos `_NEED_REVIEW`;
- los registros de provenance sigan sin aprobación del owner;
- falte el texto/licencia autoritativa de una dependencia distribuida;
- falten icono o identidad de firma.

El paquete técnico puede probarse mientras tanto, pero no se considera candidato comercial ni se
sube a Steam.

Cuando un paquete npm no incluya su texto de licencia, el owner puede colocar el texto autorizado
en `legal/third-party/<nombre-paquete>.txt`; el generador de notices prioriza ese archivo.
