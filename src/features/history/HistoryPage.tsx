export function HistoryPage() {
  return (
    <section className="page-stack" aria-labelledby="history-title">
      <header className="page-heading">
        <p className="page-kicker">Timeline</p>
        <h1 id="history-title">History</h1>
        <p className="page-summary">Task event history will be presented here when the product surface is implemented.</p>
      </header>
      <section className="empty-state" aria-label="History empty state">
        <strong>No history view yet.</strong>
        <p>WP004 preserves the event model without rendering private event data.</p>
      </section>
    </section>
  )
}
