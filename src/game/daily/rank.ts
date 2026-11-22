/**
 * Tie-break rule: equal scores go to whoever started their attempt earlier that day. Elapsed time is
 * irrelevant now that every attempt runs the full five minutes.
 *
 * A closed day already has medals stamped by the day close, so on a tie the stored medal wins: the board
 * never shows silver above gold, even for a day that was closed under an earlier tie-break rule.
 */
type RankRow = { userId: string; score: number; startedAt?: number | null; medal?: number | null }

const medalOrder = (row: RankRow) => (row.medal && row.medal > 0 ? row.medal : Infinity)

export function rankScores(rows: RankRow[]): { userId: string; rank: number }[] {
  return [...rows]
    .sort((first, second) =>
      second.score - first.score
      || medalOrder(first) - medalOrder(second)
      || (first.startedAt ?? Infinity) - (second.startedAt ?? Infinity))
    .map((row, index) => ({ userId: row.userId, rank: index + 1 }))
}
