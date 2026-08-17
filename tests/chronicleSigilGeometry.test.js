import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CHRONICLE_SIGIL_DIAL_AT,
  CHRONICLE_SIGIL_DURATION_MS,
  CHRONICLE_SIGIL_EDGES,
  CHRONICLE_SIGIL_FADE_END,
  CHRONICLE_SIGIL_NODES,
  CHRONICLE_SIGIL_SWEEP_END,
  CHRONICLE_SIGIL_SWEEP_FADE_END,
  TEMPORAL_DIAL_RING_RADIUS,
  TEMPORAL_DIAL_SEAT_RADIUS,
  TEMPORAL_DIAL_VIEWBOX_HEIGHT,
  TEMPORAL_DIAL_VIEWBOX_WIDTH,
  chronicleSigilPlan,
  chronicleSigilPresenceAt,
  chronicleSigilScaleAt,
  chronicleSigilSweepAt,
  chronicleSigilSweepPresenceAt,
  temporalDialRingRadius,
  temporalDialScale,
} from "../src/components/chronicleSigilGeometry";
import { futureVisualSignature } from "../src/utils/futureIdentity";

function radius(node) {
  return Math.hypot(node.x, node.y);
}

/** Ángulo en grados desde el Norte, en sentido horario, como los rótulos del instrumento. */
function bearing(node) {
  const degrees = (Math.atan2(node.x, -node.y) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

test("el retículo cubre, así que su escala es el mayor de los dos factores", () => {
  // Más ancha que el viewBox: manda el ancho.
  assert.equal(temporalDialScale(2000, 562), 2);
  // Más alta que el viewBox: manda el alto. Usar sólo el alto desalinearía el primer caso.
  assert.equal(temporalDialScale(1000, 1124), 2);
  assert.equal(
    temporalDialScale(TEMPORAL_DIAL_VIEWBOX_WIDTH, TEMPORAL_DIAL_VIEWBOX_HEIGHT),
    1,
  );
});

test("la punta larga nace exactamente sobre el aro del instrumento", () => {
  const ringRadius = temporalDialRingRadius(1920, 1080);
  const plan = chronicleSigilPlan(ringRadius, futureVisualSignature("748-203"));

  assert.equal(plan.nodes.length, CHRONICLE_SIGIL_NODES);
  assert.equal(plan.edges.length, CHRONICLE_SIGIL_EDGES);

  // Nodos pares del contorno = las ocho puntas; los impares son los valles.
  const tips = plan.nodes.slice(0, 16).filter((_, index) => index % 2 === 0);
  assert.equal(tips.length, 8);
  // Las cardinales son las largas y son las que caen sobre el aro: una punta de cada dos,
  // o sea los nodos 0, 4, 8 y 12. Las diagonales son más cortas a propósito.
  for (const index of [0, 4, 8, 12]) {
    assert.ok(
      Math.abs(radius(plan.nodes[index]) - ringRadius) < 1e-9,
      `la punta ${index} debe medir el radio del aro`,
    );
  }
  for (const index of [2, 6, 10, 14]) {
    assert.ok(radius(plan.nodes[index]) < ringRadius, `la diagonal ${index} es más corta`);
  }
});

test("las ocho puntas caen en los ocho rótulos del instrumento", () => {
  const plan = chronicleSigilPlan(temporalDialRingRadius(1600, 900), 0.42);
  const expected = [0, 45, 90, 135, 180, 225, 270, 315];
  const tips = plan.nodes.slice(0, 16).filter((_, index) => index % 2 === 0);
  tips.forEach((tip, index) => {
    assert.ok(
      Math.abs(bearing(tip) - expected[index]) < 1e-6,
      `la punta ${index} debe apuntar a ${expected[index]}°`,
    );
  });
});

test("el corazón se fija antes que cualquier punta y el contorno cierra en horario", () => {
  const plan = chronicleSigilPlan(200, 0.42);
  const heart = plan.nodes[CHRONICLE_SIGIL_NODES - 1];
  assert.equal(heart.x, 0);
  assert.equal(heart.y, 0);
  for (const node of plan.nodes.slice(0, 16)) {
    assert.ok(heart.lockAt < node.lockAt, "el corazón es el origen de la luz");
  }
  for (let index = 1; index < 16; index += 1) {
    assert.ok(plan.nodes[index].lockAt > plan.nodes[index - 1].lockAt);
  }
});

test("cada hilo espera a que estén fijos SUS DOS extremos", () => {
  const plan = chronicleSigilPlan(200, 0.42);
  plan.edges.forEach((edge, index) => {
    const from = plan.nodes[index];
    const to = plan.nodes[(index + 1) % 16];
    assert.equal(edge.drawAt, Math.max(from.lockAt, to.lockAt));
  });
  // El hilo de cierre (15 → 0) es el caso que delata tomar sólo el destino: aparecería al
  // principio, cuando su origen todavía no existe.
  const closing = plan.edges[15];
  assert.equal(closing.drawAt, plan.nodes[15].lockAt);
});

test("el signo se sienta en el centro de las marcas, no en el aro", () => {
  const ringRadius = temporalDialRingRadius(1920, 1080);
  const plan = chronicleSigilPlan(ringRadius, 0.42);
  const north = plan.nodes[0];

  // La punta Norte es cardinal, así que antes de sentarse mide el aro.
  assert.ok(Math.abs(radius(north) - ringRadius) < 1e-9);
  assert.ok(Math.abs(radius(north) * chronicleSigilScaleAt(0.5) - ringRadius) < 1e-9);

  // Ya sentada mide el centro de la marca, que va de 195 a 208 en unidades del viewBox.
  const seated = radius(north) * chronicleSigilScaleAt(2.0);
  const scale = temporalDialScale(1920, 1080);
  assert.ok(Math.abs(seated - TEMPORAL_DIAL_SEAT_RADIUS * scale) < 1e-9);
  assert.ok(seated > 195 * scale && seated < 208 * scale);
  // El desplazamiento es pequeño a propósito: se lee como posarse, no como encogerse.
  const growth = TEMPORAL_DIAL_SEAT_RADIUS / TEMPORAL_DIAL_RING_RADIUS - 1;
  assert.ok(growth > 0.02 && growth < 0.04);
});

test("el aro se entrega antes de que el signo se apague y la obertura termina apagada", () => {
  // El instrumento del tablero se enciende mientras el signo todavía está presente: si el
  // relevo cayera después del apagado habría un fotograma sin ninguno de los dos.
  assert.ok(CHRONICLE_SIGIL_DIAL_AT < CHRONICLE_SIGIL_SWEEP_END);
  assert.ok(chronicleSigilPresenceAt(CHRONICLE_SIGIL_DIAL_AT) > 0.9);
  assert.ok(chronicleSigilSweepAt(CHRONICLE_SIGIL_DIAL_AT) > 0);

  // Y al terminar la obertura no queda nada encendido del signo.
  const end = CHRONICLE_SIGIL_DURATION_MS / 1000;
  assert.ok(end >= CHRONICLE_SIGIL_FADE_END);
  assert.equal(chronicleSigilPresenceAt(end), 0);
});

test("la luz del aro completa una sola vuelta y nunca rebobina hacia el Norte", () => {
  let previous = 0;
  for (let milliseconds = 0; milliseconds <= CHRONICLE_SIGIL_DURATION_MS; milliseconds += 10) {
    const sweep = chronicleSigilSweepAt(milliseconds / 1000);
    assert.ok(
      sweep >= previous,
      `el recorrido no puede retroceder de ${previous} a ${sweep} en ${milliseconds} ms`,
    );
    previous = sweep;
  }
  assert.equal(previous, 1);
  assert.equal(chronicleSigilSweepAt(CHRONICLE_SIGIL_SWEEP_FADE_END), 1);
  assert.equal(chronicleSigilSweepPresenceAt(CHRONICLE_SIGIL_SWEEP_END), 1);
  assert.equal(chronicleSigilSweepPresenceAt(CHRONICLE_SIGIL_SWEEP_FADE_END), 0);
});

test("HUD y Mano toman el relevo mientras el signo termina su fundido", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const board = readFileSync(new URL("../src/components/Board.tsx", import.meta.url), "utf8");
  const battlefield = readFileSync(new URL("../src/components/Battlefield.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mockup = readFileSync(new URL("../dev/mockups/vfx/board-overture.html", import.meta.url), "utf8");
  const startSequence = app.slice(
    app.indexOf("onStart={(options) => {"),
    app.indexOf("setLaunchTransition({", app.indexOf("onStart={(options) => {")) + 320,
  );
  const handDelay = Number(app.match(/BOARD_OVERTURE_HAND_DELAY_MS = (\d+)/u)?.[1]);

  assert.ok(startSequence.indexOf("setBoardOverture(") < startSequence.indexOf("setLaunchTransition({"));
  assert.match(startSequence, /startsAtMs: startedAtMs \+ ENCOUNTER_OPEN_MS/u);
  assert.match(startSequence, /phase: "sigil"/u);
  assert.match(startSequence, /handReady: false/u);
  assert.match(startSequence, /sigilComplete: false/u);
  assert.match(app, /current\?\.id === id[\s\S]*phase: "overlap"/u);
  assert.match(app, /current\.sigilComplete \? null : \{ \.\.\.current, handReady: true \}/u);
  assert.match(app, /current\.handReady[\s\S]*sigilComplete: true/u);
  assert.ok(Number.isFinite(handDelay));
  assert.ok(
    CHRONICLE_SIGIL_DIAL_AT * 1000 + handDelay < CHRONICLE_SIGIL_DURATION_MS,
    "la Mano debe aparecer antes del último frame del signo",
  );
  assert.match(app, /<EncounterTransition\s+key=\{`encounter-\$\{launchTransition\.id\}`\}/u);
  const finalBoardTree = app.slice(app.lastIndexOf("  return ("));
  assert.ok(
    finalBoardTree.indexOf("{transitionOverlay}") < finalBoardTree.indexOf("{boardOverture && !boardOverture.sigilComplete && ("),
    "EncounterTransition conserva su slot al reemplazar StartMenu por Board",
  );
  assert.doesNotMatch(app, /useLayoutEffect/u);
  assert.match(app, /overtureHandPending=\{Boolean\(boardOverture && !boardOverture\.handReady\)\}/u);
  assert.match(board, /\{!overtureHandPending && <OpeningHandOverlay game=\{game\} \/>\}/u);
  assert.match(board, /document\.body\.classList\.toggle\("board-overture-active", overtureActive\)/u);
  assert.match(board, /document\.body\.classList\.toggle\("board-overture-settling", overtureSettling\)/u);
  assert.match(battlefield, /"game-hud-energy"/u);
  assert.match(styles, /is-encounter-entering:not\(\.is-overture\) \.game-battlefield-stage/u);
  assert.match(styles, /is-overture\.is-encounter-entering \.game-battlefield-stage[\s\S]*animation: none/u);
  assert.match(styles, /body\.board-overture-active \.game-hud-energy/u);
  assert.match(styles, /body\.board-overture-settling \.game-hud-energy[\s\S]*encounter-board-ui-bottom/u);
  assert.match(styles, /\.chronicle-sigil-overture[\s\S]*z-index: 410/u);
  assert.match(mockup, /--delay-hud: 3446ms/u);
  assert.match(mockup, /--delay-mulligan: 4096ms/u);
});

test("el signo no pinta facetas triangulares ni otra estrella en el corazón", () => {
  const shader = readFileSync(new URL("../src/components/chronicleSigilShader.ts", import.meta.url), "utf8");
  const mockup = readFileSync(new URL("../dev/mockups/vfx/board-overture.html", import.meta.url), "utf8");

  for (const source of [shader, mockup]) {
    assert.doesNotMatch(source, /float facet|float halfWidth|float star =/u);
    assert.match(source, /innerA = uCenter \+ axis\s*\*\s*0\.24/u);
    assert.match(source, /innerB = uCenter \+ axis\s*\*\s*0\.68/u);
  }
  assert.match(shader, /Un punto de origen, no otra rosa dentro de la rosa/u);
});

test("Reescribir usa un token único y la Mano no reinicia su entrada en StrictMode", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const overture = readFileSync(new URL("../src/components/ChronicleSigilOverture.tsx", import.meta.url), "utf8");
  const transition = readFileSync(new URL("../src/components/DestinyRewriteTransition.tsx", import.meta.url), "utf8");
  const openingHand = readFileSync(new URL("../src/components/OpeningHandOverlay.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const mockup = readFileSync(new URL("../dev/mockups/vfx/board-overture.html", import.meta.url), "utf8");
  const overlayStyle = styles.match(/\.opening-hand-overlay\s*\{([\s\S]*?)\}/u)?.[1] ?? "";
  const mockupMulliganStyle = mockup.match(/\.mulligan-scene\s*\{([\s\S]*?)\}/u)?.[1] ?? "";

  assert.match(app, /resolvedDestinyIdRef\.current === transitionId/u);
  assert.match(app, /destinyTransitionRef\.current\?\.id !== transitionId/u);
  assert.match(transition, /coverCommittedRef\.current/u);
  assert.match(transition, /completeCommittedRef\.current/u);
  assert.match(overture, /dialCommittedRef\.current/u);
  assert.match(overture, /completeCommittedRef\.current/u);
  assert.doesNotMatch(openingHand, /framer-motion|<motion\./u);
  assert.match(openingHand, /committedMulliganRevisionRef\.current === game\.mulligansTaken/u);
  assert.ok(overlayStyle);
  assert.ok(mockupMulliganStyle);
  assert.doesNotMatch(overlayStyle, /background\s*:/u);
  assert.doesNotMatch(mockupMulliganStyle, /background\s*:/u);
});

test("el mismo Futuro dibuja siempre el mismo signo y Futuros distintos lo frasean distinto", () => {
  const ringRadius = temporalDialRingRadius(1280, 720);
  const a = chronicleSigilPlan(ringRadius, futureVisualSignature("748-203"));
  const b = chronicleSigilPlan(ringRadius, futureVisualSignature("748-203"));
  const other = chronicleSigilPlan(ringRadius, futureVisualSignature("991-004"));

  assert.deepEqual(a.nodes, b.nodes);
  // La semilla cambia el fraseo de las motas, nunca el giro: las posiciones son idénticas.
  a.nodes.forEach((node, index) => {
    assert.equal(node.x, other.nodes[index].x);
    assert.equal(node.y, other.nodes[index].y);
  });
  assert.notEqual(a.nodes[0].seed, other.nodes[0].seed);
});
