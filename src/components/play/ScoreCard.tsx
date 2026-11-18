import { GradePanel, type GradePanelProps } from '../daily/GradePanel'

export function ScoreCard(props: GradePanelProps) {
  return <section aria-label="How you're scored" className="play-score-card">
    <h2>How you’re scored</h2>
    {!props.latest && !props.grading && !props.lastError && !props.ended
      ? <div data-testid="grade-panel" className="pp-panel play-score-card__empty" aria-live="polite">
        <div className="play-score-card__heading"><span>No grade yet</span><span data-testid="daily-best-score">Best: {props.best} / 1000</span></div>
        <div data-testid="daily-score-breakdown">{[
          { label: 'Matches the prompt', maximum: 500 },
          { label: 'Easy to recognise', maximum: 400 },
          { label: 'Speed', maximum: 100 },
        ].map(({ label, maximum }) => <div key={label} className="play-score-card__row">
          <div><span>{label}</span><span>— / {maximum}</span></div>
          <progress aria-label={`${label}, not graded yet`} value={0} max={maximum} />
        </div>)}</div>
      </div>
      : <GradePanel {...props} />}
  </section>
}
