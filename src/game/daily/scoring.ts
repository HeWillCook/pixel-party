import { DAILY } from '../config'

export interface GradeParts { fit: number; recognition: number; speed: number; total: number }

export function gradeScore(raw: { fit: number; recognition: number; elapsedMs: number }): GradeParts {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))
  const fit = clamp(raw.fit, 100) * 5
  const recognition = clamp(raw.recognition, 100) * 4
  const speed = Math.round(100 * (1 - clamp(raw.elapsedMs, DAILY.attemptMs) / DAILY.attemptMs))
  return { fit, recognition, speed, total: fit + recognition + speed }
}
