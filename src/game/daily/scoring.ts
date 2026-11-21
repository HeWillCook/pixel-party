import { DAILY } from '../config'

export interface GradeParts { fit: number; recognition: number; speed: number; total: number }

/** Recognition == 0 means the blind guess could not recognize the drawing at all, so fit stays visibly low. */
const UNRECOGNIZED_FIT_CAP = 55

export function gradeScore(raw: { fit: number; recognition: number; elapsedMs: number }): GradeParts {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))
  const recScore = clamp(raw.recognition, 100)
  // An unrecognizable drawing can still show effort, but it can never look like a
  // strong answer: cap fit hard instead of letting a generous judge award 500.
  const fitScore = Math.min(recScore <= 0 ? UNRECOGNIZED_FIT_CAP : 100, clamp(raw.fit, 100))

  const fit = fitScore * 5
  const recognition = recScore * 4
  // Speed only pays for a drawing worth recognizing. A blank or unrelated
  // canvas (fit 0 / recognition 0) earns exactly zero speed points.
  const rawSpeed = Math.round(100 * (1 - clamp(raw.elapsedMs, DAILY.attemptMs) / DAILY.attemptMs))
  const quality = (fitScore + recScore) / 200
  const speed = Math.round(rawSpeed * quality)
  return { fit, recognition, speed, total: fit + recognition + speed }
}

/** Zero-score parts for a blank canvas: a blank board must never earn speed points. */
export function blankGradeParts(): GradeParts {
  return { fit: 0, recognition: 0, speed: 0, total: 0 }
}
