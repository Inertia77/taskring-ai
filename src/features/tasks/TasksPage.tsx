export function TasksPage() {
  return (
    <section className="page-stack" aria-labelledby="tasks-title">
      <header className="page-heading">
        <p className="page-kicker">Definitions</p>
        <h1 id="tasks-title">Tasks</h1>
        <p className="page-summary">Task browsing and editing arrive in a later work package.</p>
      </header>
      <section className="empty-state" aria-label="Tasks empty state">
        <strong>No task UI yet.</strong>
        <p>The authenticated shell is ready without exposing unfinished CRUD.</p>
      </section>
    </section>
  )
}
