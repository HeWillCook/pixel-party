export function rankScores(rows: { userId: string; score: number; bestElapsedMs: number | null }[]): { userId: string; rank: number }[] {
  return [...rows]
    .sort((first, second) => second.score - first.score || (first.bestElapsedMs ?? Infinity) - (second.bestElapsedMs ?? Infinity))
    .map((row, index) => ({ userId: row.userId, rank: index + 1 }))
}
