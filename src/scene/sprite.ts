export interface Sprite {
  w: number
  h: number
  rows: readonly string[]
  palette: Readonly<Record<string, string>>
}

export function defineSprite(rows: readonly string[], palette: Record<string, string>): Sprite {
  const width = rows[0]?.length ?? 0
  for (const row of rows) {
    if (row.length !== width) throw new Error('Sprite rows must have equal width')
    for (const pixel of row) {
      if (pixel !== '.' && !Object.hasOwn(palette, pixel)) throw new Error(`Unknown sprite colour: ${pixel}`)
    }
  }
  return { w: width, h: rows.length, rows, palette }
}

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, opts?: { flipX?: boolean }): void {
  ctx.imageSmoothingEnabled = false
  sprite.rows.forEach((row, rowIndex) => {
    Array.from(row).forEach((pixel, columnIndex) => {
      if (pixel === '.') return
      ctx.fillStyle = sprite.palette[pixel]
      ctx.fillRect(Math.round(x) + (opts?.flipX ? sprite.w - columnIndex - 1 : columnIndex), Math.round(y) + rowIndex, 1, 1)
    })
  })
}
