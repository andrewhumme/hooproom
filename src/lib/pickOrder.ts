// Draft pick order — which team owns a given overall pick.
//
// Mirrors pick_team_for() / snake_default_team() in the DB, which is the
// source of truth: a commissioner's custom pick assignment wins, otherwise
// the pick follows snake order with optional reversal rounds.

/** Default snake order, ignoring custom assignments. */
export function snakeTeamForPick(
  pickNumber: number,
  teamCount: number,
  reversalRounds: number[] | null | undefined,
): { round: number; reverse: boolean; teamIdx: number } {
  const round = Math.floor((pickNumber - 1) / teamCount) + 1;
  const pickInRound = ((pickNumber - 1) % teamCount) + 1;
  const reversals = new Set(reversalRounds ?? []);
  let reverse = false;
  for (let r = 1; r < round; r++) {
    // Skip the flip going INTO round (r + 1) if that round is a reversal round
    // (the "double pick" turn keeps direction the same as the prior round).
    if (!reversals.has(r + 1)) reverse = !reverse;
  }
  const teamIdx = reverse ? teamCount - pickInRound + 1 : pickInRound;
  return { round, reverse, teamIdx };
}

/** Team that owns `pickNumber`, honoring custom pick assignments. */
export function teamForPick(
  pickNumber: number,
  teamCount: number,
  reversalRounds: number[] | null | undefined,
  assignments: ReadonlyMap<number, number>,
): number {
  return (
    assignments.get(pickNumber) ?? snakeTeamForPick(pickNumber, teamCount, reversalRounds).teamIdx
  );
}

/**
 * Pick order for one round, honoring custom assignments: one entry per pick,
 * in the order they're made. A team with a traded pick can appear twice.
 */
export function roundPickOrder(
  round: number,
  teamCount: number,
  reversalRounds: number[] | null | undefined,
  assignments: ReadonlyMap<number, number>,
): { pickNumber: number; pickInRound: number; teamIdx: number }[] {
  return Array.from({ length: teamCount }, (_, i) => {
    const pickNumber = (round - 1) * teamCount + i + 1;
    return {
      pickNumber,
      pickInRound: i + 1,
      teamIdx: teamForPick(pickNumber, teamCount, reversalRounds, assignments),
    };
  });
}
