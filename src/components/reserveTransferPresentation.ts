import { STORED_ENERGY_CAP } from "../engine/EnergySystem";

export type ReserveEnergyVisualSnapshot = Readonly<{
  available: number;
  pending: number;
  stored: number;
}>;

export type ReserveTransferPresentation = Readonly<{
  amount: number;
  sourceStartIndex: number;
  targetStartIndex: number;
}>;

export function displayedReserveEnergy(snapshot: ReserveEnergyVisualSnapshot): number {
  return Math.min(STORED_ENERGY_CAP, Math.max(0, snapshot.stored));
}

/** Maps the engine's release of pending Reserve onto the existing blue/yellow sockets. */
export function reserveTransferPresentation(
  previous: ReserveEnergyVisualSnapshot,
  current: ReserveEnergyVisualSnapshot,
): ReserveTransferPresentation | undefined {
  const amount = Math.min(
    Math.max(0, previous.pending - current.pending),
    Math.max(0, current.stored - previous.stored),
    Math.max(0, current.available),
    Math.max(0, STORED_ENERGY_CAP - displayedReserveEnergy(previous)),
  );
  if (amount === 0) return undefined;
  return {
    amount,
    sourceStartIndex: Math.max(0, current.available - amount),
    targetStartIndex: displayedReserveEnergy(previous),
  };
}
