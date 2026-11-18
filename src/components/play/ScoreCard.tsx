import { GradePanel, type GradePanelProps } from '../daily/GradePanel'

export function ScoreCard(props: GradePanelProps) {
  return <section aria-label="How you're scored" className="play-score-card">
    <h2>How you’re scored</h2>
    <GradePanel {...props} />
  </section>
}
