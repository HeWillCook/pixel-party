/**
 * Party mode has no score. A co-op round ends when Haiku recognises the drawing, and the only
 * thing it records is who paints and how long it took; team mode keeps its own winner rule.
 */
export function teamWinner(
  red: { matched: boolean; confidence: number },
  blue: { matched: boolean; confidence: number },
): 'red' | 'blue' | 'draw' {
  if (red.matched !== blue.matched) {
    return red.matched ? 'red' : 'blue'
  }
  if (red.confidence > blue.confidence) {
    return 'red'
  }
  if (blue.confidence > red.confidence) {
    return 'blue'
  }
  return 'draw'
}
