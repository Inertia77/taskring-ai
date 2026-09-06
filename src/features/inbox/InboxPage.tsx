import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chatProtocol, kinds, parseChatInterpretation } from '../../../supabase/functions/secretary-api/chat-contract'
import { createSecretaryClient, type InboxItem, type SecretaryClient } from '../../data/secretary/client'
import { supabase } from '../../lib/supabaseClient'

function ReviewEditor({ item, invoke, onSaved, onClose }: {
  item: InboxItem; invoke: SecretaryClient; onSaved: () => Promise<void>; onClose: () => void
}) {
  const initial = parseChatInterpretation({ kind: item.interpreted_kind, payload: item.interpreted_payload,
    confidence: item.confidence, needs_review: item.needs_review })
  const [kind, setKind] = useState(initial?.kind ?? 'unknown')
  const [title, setTitle] = useState(initial?.payload.title ?? '')
  const [summary, setSummary] = useState(initial?.payload.summary ?? '')
  const [assumptions, setAssumptions] = useState(initial?.payload.assumptions.join('\n') ?? '')
  const [questions, setQuestions] = useState(initial?.payload.questions.join('\n') ?? '')
  const [confidence, setConfidence] = useState(String(item.confidence ?? 0))
  const [needsReview, setNeedsReview] = useState(item.needs_review)
  const mutation = useMutation({ mutationFn: async () => {
    const split = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean)
    const interpretation = parseChatInterpretation({ kind, payload: { protocol: chatProtocol, title, summary,
      assumptions: split(assumptions), questions: split(questions) }, confidence: confidence.trim() ? Number(confidence) : NaN,
      needs_review: needsReview })
    if (!interpretation) throw new Error('Enter a title, summary and confidence between 0 and 1.')
    const payload = item.interpreted_payload
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('This legacy interpretation needs a supported object payload before review.')
    }
    await invoke({ operation: 'review_inbox_item', inbox_item_id: item.id,
      expected: { interpreted_kind: item.interpreted_kind, interpreted_payload: payload,
        confidence: item.confidence, needs_review: item.needs_review }, interpretation })
    await onSaved()
    onClose()
  } })
  return <form className="page-stack" onSubmit={(event) => { event.preventDefault(); mutation.mutate() }}>
    <label>Kind <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
      {kinds.map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <label>Title <input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label>Interpretation <textarea required maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
    <label>Assumptions (one per line)<textarea value={assumptions} onChange={(e) => setAssumptions(e.target.value)} /></label>
    <label>Questions (one per line)<textarea value={questions} onChange={(e) => setQuestions(e.target.value)} /></label>
    <label>Confidence <input type="number" min="0" max="1" step="0.01" required value={confidence} onChange={(e) => setConfidence(e.target.value)} /></label>
    <label><input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} /> Needs review</label>
    <p>Confidence below 0.8, unknown intent, assumptions or open questions always require review.</p>
    {mutation.error && <p role="alert">{mutation.error.message}</p>}
    <button type="submit" disabled={mutation.isPending}>Save interpretation</button>
    <button type="button" disabled={mutation.isPending} onClick={onClose}>Close</button>
  </form>
}

export function InboxPage({ userId, online, client }: { userId: string; online: boolean; client?: SecretaryClient }) {
  const invoke = useMemo(() => client ?? (supabase ? createSecretaryClient(supabase) : null), [client])
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<InboxItem | null>(null)
  const queryKey = ['inbox', userId, offset]
  const query = useQuery({ queryKey, queryFn: () => invoke!({ operation: 'list_inbox_items', offset }),
    enabled: online && Boolean(invoke), retry: false })
  return <section className="page-stack" aria-labelledby="inbox-title">
    <header className="page-heading"><p className="page-kicker">Capture</p><h1 id="inbox-title">Inbox</h1>
      <p className="page-summary">Review incoming ideas and correct their interpretation before planning.</p></header>
    {!online && <p role="status">Reconnect to load or review Inbox items.</p>}
    {!invoke && <p role="status">Sign in to connect your Inbox.</p>}
    {query.isFetching && <p role="status">Loading Inbox…</p>}
    {query.error && <p role="alert">{query.error.message}</p>}
    <button disabled={!online || !invoke || query.isFetching} onClick={() => { setEditing(null); void query.refetch() }}>Reload Inbox</button>
    {online && query.data?.items?.length === 0 && <p>Nothing to review yet.</p>}
    {online && query.data?.items?.map((item) => <article className="empty-state" key={item.id}>
      <p>{item.needs_review ? 'Needs review' : 'Interpreted'} · {item.disposition} · {item.source_type}</p>
      <h2>Original input</h2><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.raw_input}</p>
      <h3>Current interpretation</h3><p>{item.interpreted_kind ?? 'Unknown'} · Confidence: {item.confidence ?? 'Not supplied'}</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(item.interpreted_payload, null, 2)}</pre>
      {editing?.id === item.id && invoke ? <ReviewEditor key={item.id} item={editing} invoke={invoke}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['inbox', userId] })} onClose={() => setEditing(null)} />
        : <button disabled={item.disposition !== 'pending'} onClick={() => setEditing(item)}>Review / correct</button>}
    </article>)}
    <nav aria-label="Inbox pages">
      <button disabled={offset === 0 || !online} onClick={() => { setEditing(null); setOffset(Math.max(0, offset - 50)) }}>Previous</button>
      <button disabled={query.data?.next_offset == null || !online} onClick={() => { setEditing(null); setOffset(query.data!.next_offset!) }}>Next</button>
    </nav>
  </section>
}
