export function boardCellSize(o: {
  availWidth: number
  availHeight: number
  cols: number
  rows: number
  maxSide?: number
  minCell?: number
}): number {
  const maxSide = o.maxSide ?? 768
  const minCell = o.minCell ?? 4
  return Math.max(
    minCell,
    Math.floor(
      Math.min(
        o.availWidth / o.cols,
        o.availHeight / o.rows,
        maxSide / Math.max(o.cols, o.rows),
      ),
    ),
  )
}
