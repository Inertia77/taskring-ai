export function InboxPage() {
  return (
    <section className="page-stack" aria-labelledby="inbox-title">
      <header className="page-heading">
        <p className="page-kicker">Capture</p>
        <h1 id="inbox-title">Inbox</h1>
        <p className="page-summary">Incoming candidates will appear here once inbox workflows are implemented.</p>
      </header>
      <section className="empty-state" aria-label="Inbox empty state">
        <strong>Nothing to review yet.</strong>
        <p>This shell does not create or load inbox data.</p>
      </section>
    </section>
  )
}
