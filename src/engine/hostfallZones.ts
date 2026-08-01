export const HOSTFALL_AUTHORED_ZONES = ["ARCHIVE", "HAND", "FIELD", "MEMORY", "OBLIVION"] as const;

export type HostfallAuthoredZone = (typeof HOSTFALL_AUTHORED_ZONES)[number];
export type ZoneName = Lowercase<HostfallAuthoredZone>;

const AUTHORED_ZONE_SET = new Set<string>(HOSTFALL_AUTHORED_ZONES);

export function isHostfallAuthoredZone(value: unknown): value is HostfallAuthoredZone {
  return typeof value === "string" && AUTHORED_ZONE_SET.has(value);
}

export function toRuntimeZone(zone: HostfallAuthoredZone): ZoneName {
  return zone.toLowerCase() as ZoneName;
}
