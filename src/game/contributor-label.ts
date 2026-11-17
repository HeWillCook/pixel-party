export function contributorLabel(count: number | undefined, pixels: number): string {
  const label = count === undefined ? 'Painters' : `${count} ${count === 1 ? 'painter' : 'painters'}`
  return `${label} (${pixels} px on canvas)`
}
