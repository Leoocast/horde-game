# Persistencia desktop de Hostfall

La Fase 4 usa capacidades concretas del preload; el renderer no recibe rutas, `fs`, `path` ni un
canal IPC genérico. Main es el único proceso que lee o escribe archivos.

## Archivos bajo `userData`

```text
profile/
  preferences-v1.json
  preferences-v1.json.bak
  saves/
    resume-v1.json
    resume-v1.json.bak
local/
  window-state-v1.json
  window-state-v1.json.bak
logs/
```

`profile/preferences-v1.json` y `profile/saves/resume-v1.json` son los únicos candidatos futuros
para Steam Auto-Cloud. `local/window-state-v1.json` depende de monitores, coordenadas, maximizado y
pantalla completa de esa PC, por lo que nunca debe sincronizarse. Los logs tampoco.

Los boards y replays del Playground conservan sus namespaces de desarrollo en `localStorage`. No
se migran a `profile`, no aparecen dentro del envelope de resume y no se empaquetan en release.

## Escritura y recuperación

Cada escritura se serializa por archivo, se limita a 5 MiB y usa un temporal en el mismo directorio.
Antes de reemplazar el primario se copia el valor anterior a `.bak`; ambos temporales se sincronizan
antes del rename. Al abrir, renderer valida primario y backup por separado. Un backup válido ofrece
`Continuar partida recuperada`; si los dos fallan aparece la acción para eliminar el save dañado.

## Resume v1

El envelope contiene versión de formato, versión de app, revisión exacta del catálogo, timestamp,
claves calificadas de ambos decks, `setupTurns`, nombre y un único `GameState` de dominio. No se
serializa Zustand ni campos de UI, timers, animaciones, targeting o Playground.

El autosave espera 220 ms y vuelve a evaluar el store. Sólo escribe cuando no hay eventos, commits
diferidos, combate declarado, selección manual con consecuencias ni presentación activa. Por eso
cerrar durante Burn, una secuencia de la Hueste o una elección restaura el checkpoint estable
anterior. Un schema, revisión o deck ausente se rechaza: nunca se sustituye silenciosamente por el
deck predeterminado.

## Preferencias y lifecycle

La primera vez que Electron no encuentra `preferences-v1.json`, importa idioma y audio desde los
namespaces `localStorage` vigentes y crea el archivo. La web sigue usando esos adapters sin IPC.
El mismo envelope de preferencias contiene el progreso mínimo de lecciones guiadas:
`lessonId`, `completedRevision` y `completedAt`. Nunca contiene el paso activo, el escenario,
bindings, timers o `GameState`. Los `preferences-v1.json` anteriores siguen siendo válidos y añaden
este campo de forma aditiva; la clave de onboarding del nombre no equivale a completar un tutorial.

Una pantalla `tutorial` no inicia checkpointing de resume. Entrar, salir o completar una lección no
lee, reemplaza ni elimina `profile/saves/resume-v1.json`; un resume normal existente sólo se oculta
mientras haya una lección obligatoria pendiente.

F11 y los controles de Pantalla alternan fullscreen; coordenadas, tamaño, maximizado y fullscreen
se guardan localmente. Al minimizar, perder foco o suspender el sistema se detienen SFX y se pausa
la música como pausa de lifecycle. Al volver sólo se reanuda si no estaba pausada o silenciada por
el usuario. `backgroundThrottling` permanece en `true`; la corrección del save no depende de que un
timer termine mientras la aplicación está en segundo plano.
