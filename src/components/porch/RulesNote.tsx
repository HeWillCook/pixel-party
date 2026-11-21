/** The house-rules note, read close up: the page of paper the camera is on. */
export function RulesNote({ onClose, closeRef }: { onClose: () => void; closeRef?: (element: HTMLButtonElement | null) => void }) {
  return <div className="porch-rules-paper">
    <h2>How the daily challenge works</h2>
    <p>Matches the prompt: up to 500 points. Easy to recognise: up to 400. Speed: up to 100.</p>
    <p>An auto-grade every minute (at 1, 2, 3 and 4); 3 manual grades. Your best grade counts. Submit ends your attempt.</p>
    <button ref={closeRef} type="button" className="pp-btn" onClick={onClose}>Close</button>
  </div>
}
