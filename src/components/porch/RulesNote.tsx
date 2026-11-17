export function RulesNote({ onClose }: { onClose: () => void }) {
  return <section className="porch-rules pp-panel" role="dialog" aria-label="Daily scoring rules">
    <h2>How the daily challenge works</h2>
    <p>Matches the prompt: up to 500 points. Easy to recognise: up to 400. Speed: up to 100.</p>
    <p>Auto-grades at 2, 4, 6 and 8 minutes; 3 manual grades. Your best grade counts. Submit ends your attempt.</p>
    <button type="button" className="pp-btn" onClick={onClose}>Close</button>
  </section>
}
