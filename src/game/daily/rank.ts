/**
 * Tie-break rule: equal scores go to whoever started their attempt earlier that day. Elapsed time is
 * irrelevant now that every attempt runs the full five minutes.
 */
export function rankScores(rows: { userId: string; score: number; startedAt?: number | null }[]): { userId: string; rank: number }[] {
  return [...rows]
    .sort((first, second) => second.score - first.score || (first.startedAt ?? Infinity) - (second.startedAt ?? Infinity))
    .map((row, index) => ({ userId: row.userId, rank: index + 1 }))
}
