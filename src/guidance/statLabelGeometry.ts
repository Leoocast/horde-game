/**
 * Geometría de las cartelas que nombran Fuerza y Aguante sobre la comparación grande
 * de cartas. Las cartelas se colocan con CSS en `cqw` del marco, pero la guía que
 * llega hasta cada cifra depende del ancho real del marcador —que crece con los
 * dígitos— así que se calcula aquí a partir de rectángulos ya medidos.
 *
 * Todas las coordenadas son píxeles relativos a la esquina superior izquierda del
 * marco de la carta.
 */

export type StatLabelBox = Readonly<{ left: number; top: number; width: number; height: number }>;
export type StatLabelPoint = Readonly<{ x: number; y: number }>;
export type StatLabelHalf = "power" | "endurance";

export type StatLabelLeader = Readonly<{
  half: StatLabelHalf;
  path: string;
  target: StatLabelPoint;
  /** Radio del punto que remata la guía, proporcional al marcador y no al viewport. */
  radius: number;
}>;

/**
 * El marcador imprime Fuerza, la barra y Aguante en ese orden y con el mismo peso,
 * así que cada cifra cae a un cuarto y a tres cuartos de su ancho por muchos dígitos
 * que tenga. Apuntar a la mitad evita depender del nodo concreto de cada número.
 */
const HALF_ANCHOR: Readonly<Record<StatLabelHalf, number>> = Object.freeze({
  power: 0.27,
  endurance: 0.73,
});

/** Punto al que apunta la guía: el centro visual de la mitad que nombra la cartela. */
export function statBadgeAnchor(badge: StatLabelBox, half: StatLabelHalf): StatLabelPoint {
  return Object.freeze({
    x: badge.left + badge.width * HALF_ANCHOR[half],
    y: badge.top + badge.height / 2,
  });
}

/**
 * Punto del canto de `box` por el que la guía sale hacia `target`. Se elige el lado
 * al que realmente mira el objetivo, no una esquina fija, para que la cartela pueda
 * quedar arriba, abajo o al costado sin recalibrar nada.
 */
export function statLabelEdgePoint(box: StatLabelBox, target: StatLabelPoint, inset = 6): StatLabelPoint {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  const dx = target.x - centerX;
  const dy = target.y - centerY;
  if (Math.abs(dx) * box.height >= Math.abs(dy) * box.width) {
    return Object.freeze({
      x: dx >= 0 ? right : box.left,
      y: clamp(target.y, box.top + inset, bottom - inset),
    });
  }
  return Object.freeze({
    x: clamp(target.x, box.left + inset, right - inset),
    y: dy >= 0 ? bottom : box.top,
  });
}

/**
 * Curva de la cartela a la cifra. Los controles se adelantan sobre el eje dominante,
 * así que la guía nace perpendicular al canto de la cartela y muere apuntando al
 * número: la misma idea que `guidedConnectorPath`, en corto y sin roles de ancla.
 */
export function statLeaderPath(from: StatLabelPoint, to: StatLabelPoint): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const controlA = horizontal
    ? { x: from.x + dx * 0.55, y: from.y }
    : { x: from.x, y: from.y + dy * 0.55 };
  const controlB = horizontal
    ? { x: from.x + dx * 0.72, y: to.y }
    : { x: to.x, y: from.y + dy * 0.72 };
  return `M ${round(from.x)} ${round(from.y)} C ${round(controlA.x)} ${round(controlA.y)}, ` +
    `${round(controlB.x)} ${round(controlB.y)}, ${round(to.x)} ${round(to.y)}`;
}

/** Las dos guías de una carta, ya listas para pintarse dentro del marco. */
export function statLabelLeaders(
  badge: StatLabelBox,
  labels: Readonly<Record<StatLabelHalf, StatLabelBox>>,
): readonly StatLabelLeader[] {
  if (!(badge.width > 0) || !(badge.height > 0)) return Object.freeze([]);
  const halves: readonly StatLabelHalf[] = ["power", "endurance"];
  return Object.freeze(halves.flatMap((half) => {
    const label = labels[half];
    if (!(label.width > 0) || !(label.height > 0)) return [];
    const target = statBadgeAnchor(badge, half);
    const start = statLabelEdgePoint(label, target);
    return [Object.freeze({
      half,
      path: statLeaderPath(start, target),
      target,
      radius: round(Math.max(1.4, badge.height * 0.062)),
    })];
  }));
}

export function statLabelLeadersEqual(
  left: readonly StatLabelLeader[],
  right: readonly StatLabelLeader[],
): boolean {
  return left.length === right.length && left.every((leader, index) => {
    const other = right[index];
    return Boolean(other) && leader.half === other.half && leader.path === other.path &&
      leader.radius === other.radius &&
      leader.target.x === other.target.x && leader.target.y === other.target.y;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
