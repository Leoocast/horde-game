import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DESTINY_CONSTELLATION_BLOOM_AT,
  DESTINY_CONSTELLATION_EDGES,
  DESTINY_CONSTELLATION_HEART_LOCK,
  DESTINY_CONSTELLATION_NODES,
  DESTINY_CONSTELLATION_TOTAL_MS,
  DESTINY_CONSTELLATION_VERDICT_AT,
  destinyConstellationBloomAt,
  destinyConstellationHeartIndex,
  destinyConstellationPlan,
  destinyConstellationVerdictDelayMs,
} from "../src/components/destinyConstellationGeometry";
import {
  chronicleSigilPlan,
  temporalDialRingRadius,
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

test("la constelación es la misma rosa cardinal que el signo y el disco de grados", () => {
  const ringRadius = temporalDialRingRadius(1920, 1080);
  const signature = futureVisualSignature("748-203");
  const plan = destinyConstellationPlan(ringRadius, signature);
  const sigil = chronicleSigilPlan(ringRadius, signature);

  assert.equal(plan.nodes.length, DESTINY_CONSTELLATION_NODES);
  assert.equal(plan.edges.length, DESTINY_CONSTELLATION_EDGES);
  assert.equal(plan.unit, sigil.unit);
  assert.equal(plan.ringRadius, ringRadius);
  // Ni una posición propia: si la figura se separase del instrumento dejaría de leerse como el
  // mismo aparato encendiéndose y pasaría a ser otra estrella pegada encima.
  plan.nodes.forEach((node, index) => {
    assert.equal(node.x, sigil.nodes[index].x);
    assert.equal(node.y, sigil.nodes[index].y);
  });

  // Las cardinales caen sobre el aro y apuntan a los ocho rótulos del instrumento.
  for (const index of [0, 4, 8, 12]) {
    assert.ok(Math.abs(radius(plan.nodes[index]) - ringRadius) < 1e-9);
  }
  const expected = [0, 45, 90, 135, 180, 225, 270, 315];
  plan.nodes.slice(0, 16).filter((_, index) => index % 2 === 0).forEach((tip, index) => {
    assert.ok(Math.abs(bearing(tip) - expected[index]) < 1e-6);
  });
});

test("el corazón se fija primero y el contorno se traza desde el Norte", () => {
  const plan = destinyConstellationPlan(200, 0.42);
  const heart = plan.nodes[destinyConstellationHeartIndex()];

  assert.equal(heart.x, 0);
  assert.equal(heart.y, 0);
  assert.equal(heart.lockAt, DESTINY_CONSTELLATION_HEART_LOCK);

  let previous = heart.lockAt;
  for (let index = 0; index < 16; index += 1) {
    const node = plan.nodes[index];
    assert.ok(node.lockAt > heart.lockAt, `el nodo ${index} no puede fijarse antes que el corazón`);
    assert.ok(node.lockAt >= previous, `el contorno no puede retroceder en el nodo ${index}`);
    previous = node.lockAt;
  }
  // Toda la figura queda cerrada antes de que el corazón florezca.
  assert.ok(previous < DESTINY_CONSTELLATION_BLOOM_AT);
});

test("cada hilo espera a sus DOS extremos, incluido el de cierre", () => {
  const plan = destinyConstellationPlan(200, 0.42);
  plan.edges.forEach((edge, index) => {
    const from = plan.nodes[index].lockAt;
    const to = plan.nodes[(index + 1) % 16].lockAt;
    assert.equal(edge.lockAt, Math.max(from, to));
  });
  // El hilo 15 → 0 cierra la figura: tomar sólo su destino lo hacía aparecer al principio,
  // cuando su origen todavía no existía.
  const closing = plan.edges[15];
  assert.equal(closing.lockAt, plan.nodes[15].lockAt);
  assert.ok(closing.lockAt > plan.nodes[0].lockAt);
});

test("el desenlace se nombra con la figura cerrada y la onda ya en marcha", () => {
  assert.ok(DESTINY_CONSTELLATION_VERDICT_AT > DESTINY_CONSTELLATION_BLOOM_AT);
  assert.equal(destinyConstellationBloomAt(DESTINY_CONSTELLATION_BLOOM_AT), 0);
  assert.ok(destinyConstellationBloomAt(DESTINY_CONSTELLATION_VERDICT_AT) > 0);
  assert.equal(destinyConstellationBloomAt(1), 1);
  assert.equal(destinyConstellationBloomAt(0), 0);
  assert.equal(
    destinyConstellationVerdictDelayMs(),
    DESTINY_CONSTELLATION_VERDICT_AT * DESTINY_CONSTELLATION_TOTAL_MS,
  );
});

test("el mismo Futuro reparte igual sus motas y otro Futuro las frasea distinto", () => {
  const ringRadius = temporalDialRingRadius(1280, 720);
  const a = destinyConstellationPlan(ringRadius, futureVisualSignature("748-203"));
  const b = destinyConstellationPlan(ringRadius, futureVisualSignature("748-203"));
  const other = destinyConstellationPlan(ringRadius, futureVisualSignature("991-004"));

  assert.deepEqual(a.nodes, b.nodes);
  assert.deepEqual(a.edges, b.edges);
  // La semilla cambia el fraseo de las motas, nunca el giro de la estrella.
  a.nodes.forEach((node, index) => {
    assert.equal(node.x, other.nodes[index].x);
    assert.equal(node.y, other.nodes[index].y);
    assert.equal(node.lockAt, other.nodes[index].lockAt);
  });
  assert.notEqual(a.nodes[0].seed, other.nodes[0].seed);
});

test("la victoria retira el tablero pero conserva el espacio y el instrumento", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const board = readFileSync(new URL("../src/components/Board.tsx", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../src/components/VictoryModal.tsx", import.meta.url), "utf8");
  const animator = readFileSync(
    new URL("../src/components/VictoryConstellationAnimator.tsx", import.meta.url),
    "utf8",
  );

  // El desenlace espera a que la presentación se asiente, igual que la derrota.
  assert.match(board, /const victoryReady = outcomeOutroReady && game\.winner === "player"/u);
  assert.match(board, /sessionKind === "normal" && victoryReady/u);
  // El tema entra con el desenlace, no con el último golpe.
  assert.match(board, /if \(victoryReady\) playCollection\("winTheme"\)/u);

  // El cielo, la capa de ambiente y el retículo entero siguen vivos: la figura se enciende sobre
  // el disco de grados, así que el instrumento no puede irse con el HUD. La derrota sí lo retira.
  const clearing = styles.match(
    /body\.is-victory-clearing \.game-screen > \*:not\(:where\(([^)]*)\)\)/u,
  )?.[1];
  assert.ok(clearing, "la salida del tablero debe declarar sus exclusiones");
  assert.match(clearing, /\.temporal-backdrop/u);
  assert.match(clearing, /\.game-screen-ambience/u);
  assert.match(clearing, /\.game-result-overlay/u);
  assert.doesNotMatch(styles, /is-victory-clearing[\s\S]{0,400}temporal-backdrop-grid/u);

  // Nada de destello DOM a pantalla completa ni tinte sobre el tablero: lo cuenta la escena WebGL.
  assert.doesNotMatch(styles, /\.victory-constellation-flash|\.victory-constellation-vignette/u);
  assert.doesNotMatch(animator, /new THREE\.WebGLRenderer/u);
  assert.match(animator, /renderSharedVfxFrame/u);
  // El lienzo permanece oculto hasta copiar su primer fotograma válido.
  assert.match(animator, /canvas\.classList\.add\("is-ready"\)/u);
  assert.match(styles, /\.game-result-victory \.victory-constellation-canvas\.is-ready \{ opacity: 1; \}/u);

  // El desenlace ya no vuelve al estandarte ni al panel genéricos del resultado.
  assert.doesNotMatch(modal, /game-result-banner|game-result-panel|DestinyOutcomeSeal/u);
  assert.match(modal, /VictoryConstellationAnimator/u);
});
