/** The house-rules note, read close up: the page of paper the camera is on. */
export function RulesNote({ onClose, closeRef }: { onClose: () => void; closeRef?: (element: HTMLButtonElement | null) => void }) {
  return <div className="porch-rules-paper">
    <h2>How the daily challenge works</h2>
    <p>Matches the prompt: up to 500 points. Art quality bonus: up to 500 more, and it only pays out as far as the drawing matches.</p>
    <p>Haiku looks twice: a halfway judgement at 2:30, then the final verdict at 5:00. Paint for the full five minutes — there is no early finish. Your best judgement is your score; your last canvas is the painting.</p>
    <button ref={closeRef} type="button" className="pp-btn" onClick={onClose}>Close</button>
  </div>
}
