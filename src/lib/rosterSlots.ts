// Roster slot configuration & assignment helpers.
//
// A draft room defines a fixed set of starting slots:
//   PG, SG, SF, PF, C, FLX (FLX = any position)
// Each pick fills the first available slot matching the player's position,
// falling back to FLX if no specific slot is open.

export const SLOT_KEYS = ["PG", "SG", "SF", "PF", "C", "FLX", "BN"] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

export type SlotConfig = Record<SlotKey, number>;

export const DEFAULT_SLOTS: SlotConfig = {
  PG: 1,
  SG: 1,
  SF: 1,
  PF: 1,
  C: 1,
  FLX: 3,
  BN: 3,
};

export function totalSlots(cfg: SlotConfig): number {
  return SLOT_KEYS.reduce((sum, k) => sum + (cfg[k] || 0), 0);
}

// A flat list of slot "spots" in fill order: all PGs, then SGs … then FLX.
// Each spot is keyed (e.g. "PG1", "PG2", "FLX1") for stable display.
export type SlotSpot = { key: string; pos: SlotKey; index: number };

export function buildSlotSpots(cfg: SlotConfig): SlotSpot[] {
  const out: SlotSpot[] = [];
  for (const pos of SLOT_KEYS) {
    const n = cfg[pos] || 0;
    for (let i = 1; i <= n; i++) {
      out.push({ key: `${pos}${i}`, pos, index: i });
    }
  }
  return out;
}

// Map a player's position string (e.g. "G", "F-C", "PG-SG") to the candidate
// specific slots they can fill. Falls back to all when ambiguous.
export function eligibleSlotsForPosition(rawPos: string | null | undefined): SlotKey[] {
  const p = (rawPos || "").toUpperCase();
  if (!p) return ["FLX"];
  const set = new Set<SlotKey>();
  // Direct mentions
  if (p.includes("PG")) set.add("PG");
  if (p.includes("SG")) set.add("SG");
  if (p.includes("SF")) set.add("SF");
  if (p.includes("PF")) set.add("PF");
  // Generic guards/forwards/centers
  if (p === "G" || p.includes("G-") || p.endsWith("-G")) {
    set.add("PG");
    set.add("SG");
  }
  if (p === "F" || p.includes("F-") || p.endsWith("-F")) {
    set.add("SF");
    set.add("PF");
  }
  if (p.includes("C")) set.add("C");
  if (set.size === 0) {
    // Unknown — let it land in FLX only
    return ["FLX"];
  }
  return Array.from(set);
}

// Greedy assignment: walk picks in order, fill first-available specific slot,
// otherwise FLX, otherwise overflow (returned as null spotKey).
export function assignPicksToSlots<P extends { player_position: string | null }>(
  picks: P[],
  cfg: SlotConfig,
): { pick: P; spotKey: string | null }[] {
  const spots = buildSlotSpots(cfg);
  const taken = new Set<string>();
  const result: { pick: P; spotKey: string | null }[] = [];

  for (const pick of picks) {
    const eligible = eligibleSlotsForPosition(pick.player_position);
    let chosen: string | null = null;

    // 1. Try a specific slot matching one of the eligible positions.
    for (const spot of spots) {
      if (taken.has(spot.key)) continue;
      if (spot.pos === "FLX" || spot.pos === "BN") continue;
      if (eligible.includes(spot.pos)) {
        chosen = spot.key;
        break;
      }
    }
    // 2. Fall back to first open FLX.
    if (!chosen) {
      for (const spot of spots) {
        if (taken.has(spot.key)) continue;
        if (spot.pos === "FLX") {
          chosen = spot.key;
          break;
        }
      }
    }
    // 3. Fall back to first open BN (bench).
    if (!chosen) {
      for (const spot of spots) {
        if (taken.has(spot.key)) continue;
        if (spot.pos === "BN") {
          chosen = spot.key;
          break;
        }
      }
    }
    if (chosen) taken.add(chosen);
    result.push({ pick, spotKey: chosen });
  }

  return result;
}
