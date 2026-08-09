Quiero que diseñes un **plan técnico de migración completo y ejecutable para Hostfall**, basándote primero en el estado REAL del repositorio.

Adjunto una investigación/preanálisis que debes usar como contexto y dirección arquitectónica, pero **no debes asumir que todo lo que dice es correcto**. Verifica cada punto importante directamente contra el código actual antes de incluirlo en el plan.

## Objetivo principal

Migrar Hostfall de su arquitectura actual de aplicación web/SPA a una aplicación de escritorio basada en **Electron**, inicialmente enfocada en:

* Windows x64.
* Distribución mediante Steam.
* Funcionamiento completamente offline.
* Persistencia apropiada para una aplicación de escritorio.
* Arquitectura segura de Electron.
* Build y empaquetado reproducible.
* Preparación futura para Steam Cloud, Steamworks y Steam Workshop.

La intención NO es reescribir el juego.

El engine, gameplay, Zustand, React/componentes, animaciones y sistemas existentes deben permanecer intactos siempre que sea razonablemente posible.

La migración debe crear una frontera alrededor de la aplicación actual, no reemplazar innecesariamente sistemas que ya funcionan.

---

# Restricción arquitectónica importante: contenido y futuros mods

Hostfall tendrá soporte para mods en el futuro mediante Steam Workshop.

No vamos a implementar mods ni Workshop durante esta migración.

Sin embargo, quiero evitar tomar decisiones durante la migración a Electron que después nos obliguen a rehacer toda la carga de decks/assets.

El modelo futuro será aproximadamente:

* Contenido builtin.
* Contenido local.
* Steam Workshop.

Workshop debe considerarse simplemente otra fuente de instalación de contenido local no confiable.

Los mods:

* Podrán proporcionar decks mediante JSON.
* Utilizarán únicamente efectos ya existentes en el engine.
* No podrán ejecutar ni inyectar código.
* No deberán poder cargar JavaScript, HTML, ejecutables o contenido remoto.
* Deberán pasar por validación antes de entrar al catálogo.

IMPORTANTE:

**No quiero cambiar actualmente el schema de los decks ni los JSON authored existentes salvo que exista una razón absolutamente necesaria.**

Si es posible, quiero preparar ahora conceptos como:

* ContentSource
* ContentCatalog
* AssetResolver
* ContentPackDescriptor
* namespace/origin de contenido
* validación separada builtin/external

pero solamente hasta el punto necesario para crear una frontera arquitectónica estable.

No implementes todavía:

* carpeta de mods;
* Steam Workshop;
* ISteamUGC;
* UI para mods;
* publicación de mods;
* hot reload de mods;
* dependencias entre mods;
* compatibilidad avanzada entre versiones.

Evita sobrearquitectura especulativa.

---

# Tu tarea

Antes de proponer el plan:

## 1. Audita el repositorio

Inspecciona el código real y determina:

* arquitectura actual;
* punto de entrada;
* sistema de build;
* Vite/configuración actual;
* package.json y dependencias;
* Zustand/stores;
* persistencia actual;
* uso de localStorage;
* carga de decks;
* carga de manifests;
* carga de assets;
* rutas absolutas `/...`;
* fuentes y recursos remotos;
* sistema de audio;
* sistemas que dependan del navegador;
* APIs web utilizadas;
* lifecycle actual;
* deck registry;
* normalización de decks;
* deckLint;
* EffectResolver;
* effect vocabulary;
* custom handlers;
* Card Studio o herramientas relacionadas;
* tests existentes;
* scripts existentes;
* CI si existe;
* estructura de assets;
* tamaño aproximado del build;
* cualquier dependencia que pueda tener problemas dentro de Electron.

Busca también dependencias implícitas en:

* `window`
* `document`
* `location`
* `fetch`
* `localStorage`
* `sessionStorage`
* URLs absolutas
* filesystem assumptions
* Web Audio
* workers
* drag and drop
* clipboard
* fullscreen
* focus/blur
* navegación externa

No quiero un análisis genérico de Electron.

Quiero un análisis específico de ESTE repositorio.

---

# 2. Contrasta las recomendaciones del contexto con el repo

Si encuentras una mejor solución que la propuesta en el documento, indícala y explica por qué.

No mantengas una decisión solamente porque aparece en el documento.

---

# 3. Diseña el plan de migración

Después de la auditoría, produce un plan por fases.

Quiero que las fases tengan dependencias explícitas y que cada fase deje el proyecto en un estado funcional.

Prefiero múltiples verticales pequeñas y verificables antes que una migración masiva.

Quiero que determines tú la secuencia técnicamente correcta.

---

# 4. Para cada fase quiero

Para cada fase entrega:

### Objetivo

Qué problema resuelve.

### Motivación

Por qué debe existir y por qué ocurre en ese momento.


### Criterios de aceptación

Condiciones concretas que demuestren que la fase está terminada.

No uses criterios vagos como:

> Electron funciona.

Prefiero cosas verificables como:

> Ejecutar el build empaquetado sin conexión de red no produce requests HTTP/HTTPS y todos los decks/assets/audio builtin cargan correctamente.

### Tests

Qué tests:

* unitarios;
* integración;
* smoke;
* manuales

deben añadirse o ejecutarse.

### Riesgos

Qué podría romperse.


---

# 5. Identifica decisiones arquitectónicas

Quiero una sección específica:

# Architecture Decision Records necesarios

Enumera las decisiones que deberíamos fijar antes de empezar.

Por ejemplo:

* Electron Forge vs alternativa.
* estrategia de Vite.
* protocolo `hostfall://`.
* ASAR vs recursos unpacked.
* ubicación de saves.
* versión/formato de saves.
* ContentSource.
* ContentCatalog.
* AssetResolver.
* estrategia de IDs/namespaces.
* builtin vs external validation policy.
* aislamiento Steamworks/main process.
* distribución de assets grandes.

Para cada ADR incluye:

* decisión;
* alternativas;
* recomendación;
* consecuencias;
* qué tan difícil sería cambiarla después.

---

# 6. Seguridad

Diseña explícitamente la frontera de seguridad Electron:

* `nodeIntegration`
* `contextIsolation`
* sandbox
* preload
* IPC
* navegación
* ventanas nuevas
* URLs externas
* Content Security Policy
* filesystem exposure
* protocolo custom
* contenido externo futuro

Asume que los futuros mods son completamente NO CONFIABLES.

El renderer nunca debe recibir acceso arbitrario a Node o filesystem simplemente para facilitar futuros mods.

---

# 7. Identifica deuda y cosas que NO debemos mezclar

Durante el análisis probablemente encontrarás mejoras posibles.

Sepáralas entre:

### Necesaria para la migración.

### Conveniente durante la migración.

### Deuda técnica independiente.

### Feature futura.

No quiero convertir esta migración en una reescritura general del juego.

---

# 8. Riesgos globales

Crea un registro de riesgos con:

* riesgo;
* probabilidad;
* impacto;
* detección;
* mitigación;
* fase donde debe resolverse.

Presta especial atención a:

* Electron security;
* filesystem;
* protocolos custom;
* audio;
* assets grandes;
* ASAR;
* rutas;
* Vite;
* SteamPipe;
* persistencia;
* saves incompatibles;
* contenido dinámico;
* determinismo;
* Steam Deck futuro;
* módulos nativos futuros;
* Steam Workshop futuro.

---

# 9. Resultado final

Termina con:

## Recommended Migration Roadmap

Una lista ordenada de fases.

---

# Restricciones

Durante esta tarea:

**NO MODIFIQUES CÓDIGO.**

**NO CREES COMMITS.**

**NO IMPLEMENTES LA MIGRACIÓN.**

**NO CAMBIES JSON DE DECKS.**

**NO HAGAS REFACTORS.**

Quiero únicamente investigación del repositorio + diseño del plan.

Cuando una afirmación dependa del código, referencia el archivo y, cuando sea útil, símbolos o líneas relevantes.

No inventes sistemas que no existan.

No escondas problemas para hacer que el plan parezca más sencillo.

Si detectas una mala decisión arquitectónica actual que afectará seriamente la migración, señálala explícitamente.

Prioriza:

1. preservar comportamiento;
2. migración incremental;
3. seguridad;
4. reversibilidad;
5. testabilidad;
6. separación de responsabilidades;
7. preparación razonable para contenido dinámico futuro;
8. evitar sobrearquitectura.
