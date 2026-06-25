// components/DailyCashUp.tsx
// Daily Cash Up section — sidebar card for HospoMetrics dashboard
// Shows historic nightly reconciliation entries with variance indicators + comments

'use client'

import { useEffect, useState } from 'react'

interface Reconciliation {
  id: string
  date: string
  till: string
  submitted_by: string
  note: string | null
  previous_night_count: number | null
  open_count: number | null
  end_of_shift_count: number | null
  epos_cash_taken: number | null
  card_reading_1: number | null
  card_reading_2: number | null
  eposnow_card_takings: number | null
  withdrawals: number | null
  petty_cash: number | null
  cash_variance: number | null
  card_variance: number | null
  total_variance: number | null
  created_at: string
}

interface Props {
  venueId?: string
}

function fmt(val: number | null): string {
  if (val == null) return '—'
  const abs = Math.abs(val).toFixed(2)
  return (val < 0 ? '-' : val > 0 ? '+' : '') + '£' + abs
}

function VariancePill({ value }: { value: number | null }) {
  if (value == null) return <span className="variance-pill neutral">—</span>
  const abs = Math.abs(value)
  const cls = abs <= 2 ? 'ok' : abs <= 10 ? 'warn' : 'bad'
  return <span className={`variance-pill ${cls}`}>{fmt(value)}</span>
}

function EntryRow({
  rec,
  expanded,
  onToggle,
}: {
  rec: Reconciliation
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="entry-row">
      <div className="entry-summary" onClick={onToggle}>
        <div className="entry-left">
          <span className="entry-date">
            {new Date(rec.date).toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </span>
          <span className="entry-till">{rec.till}</span>
        </div>
        <div className="entry-right">
          <VariancePill value={rec.total_variance} />
          <span className="entry-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="entry-detail">
          <div className="detail-grid">
            <div className="detail-section">
              <p className="detail-heading">Cash</p>
              <div className="detail-row"><span>Open count</span><span>{fmt(rec.open_count)}</span></div>
              <div className="detail-row"><span>End of shift</span><span>{fmt(rec.end_of_shift_count)}</span></div>
              <div className="detail-row"><span>EPOS cash</span><span>{fmt(rec.epos_cash_taken)}</span></div>
              <div className="detail-row"><span>Withdrawals</span><span>{fmt(rec.withdrawals)}</span></div>
              <div className="detail-row"><span>Petty cash</span><span>{fmt(rec.petty_cash)}</span></div>
              <div className="detail-row variance-row">
                <span>Cash variance</span>
                <VariancePill value={rec.cash_variance} />
              </div>
            </div>
            <div className="detail-section">
              <p className="detail-heading">Card</p>
              <div className="detail-row"><span>PDQ reading 1</span><span>{fmt(rec.card_reading_1)}</span></div>
              <div className="detail-row"><span>PDQ reading 2</span><span>{fmt(rec.card_reading_2)}</span></div>
              <div className="detail-row"><span>EPOSNOW card</span><span>{fmt(rec.eposnow_card_takings)}</span></div>
              <div className="detail-row variance-row">
                <span>Card variance</span>
                <VariancePill value={rec.card_variance} />
              </div>
            </div>
          </div>

          <div className="detail-footer">
            <span className="submitted-by">Submitted by {rec.submitted_by}</span>
            {rec.note && <p className="entry-note">💬 {rec.note}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DailyCashUp({ venueId }: Props) {
  const [entries, setEntries]     = useState<Reconciliation[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const url = venueId
      ? `/api/reconciliation?venueId=${venueId}&limit=30`
      : `/api/reconciliation?limit=30`

    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error)
        setEntries(json.data ?? [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [venueId])

  const toggle = (id: string) =>
    setExpandedId(prev => (prev === id ? null : id))

  return (
    <>
      <style>{`
        .cashup-card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          overflow: hidden;
          font-family: 'Inter', 'DM Sans', sans-serif;
        }
        .cashup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid #f0f0f0;
          background: #f9fafb;
        }
        .cashup-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #374151;
        }
        .cashup-badge {
          font-size: 11px;
          background: #e5e7eb;
          color: #6b7280;
          padding: 2px 8px;
          border-radius: 99px;
          font-weight: 600;
        }
        .cashup-empty, .cashup-loading, .cashup-error {
          padding: 28px 18px;
          text-align: center;
          font-size: 13px;
          color: #9ca3af;
        }
        .cashup-error { color: #991b1b; }

        .entry-row {
          border-bottom: 1px solid #f3f4f6;
        }
        .entry-row:last-child { border-bottom: none; }
        .entry-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .entry-summary:hover { background: #f9fafb; }
        .entry-left { display: flex; flex-direction: column; gap: 2px; }
        .entry-date { font-size: 13px; font-weight: 600; color: #111827; }
        .entry-till { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
        .entry-right { display: flex; align-items: center; gap: 10px; }
        .entry-chevron { font-size: 9px; color: #9ca3af; }

        .variance-pill {
          font-size: 12px;
          font-weight: 700;
          padding: 2px 9px;
          border-radius: 99px;
        }
        .variance-pill.ok      { background: #dcfce7; color: #166534; }
        .variance-pill.warn    { background: #fef9c3; color: #854d0e; }
        .variance-pill.bad     { background: #fee2e2; color: #991b1b; }
        .variance-pill.neutral { background: #f3f4f6; color: #9ca3af; }

        .entry-detail {
          padding: 0 18px 16px;
          background: #fafafa;
          border-top: 1px solid #f3f4f6;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding-top: 14px;
        }
        .detail-heading {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          margin-bottom: 8px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #374151;
          padding: 3px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .detail-row:last-child { border-bottom: none; }
        .detail-row span:first-child { color: #6b7280; }
        .variance-row { margin-top: 4px; border-bottom: none !important; }

        .detail-footer {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
        }
        .submitted-by { font-size: 11px; color: #9ca3af; }
        .entry-note {
          margin-top: 6px;
          font-size: 12px;
          color: #374151;
          background: #fff;
          border-left: 3px solid #d1d5db;
          padding: 6px 10px;
          border-radius: 0 4px 4px 0;
        }
      `}</style>

      <div className="cashup-card">
        <div className="cashup-header">
          <span className="cashup-title">Daily Cash Up</span>
          {!loading && !error && (
            <span className="cashup-badge">{entries.length} entries</span>
          )}
        </div>

        {loading && <div className="cashup-loading">Loading…</div>}
        {error   && <div className="cashup-error">Could not load entries: {error}</div>}

        {!loading && !error && entries.length === 0 && (
          <div className="cashup-empty">No submissions yet — complete the first end-of-shift form to get started.</div>
        )}

        {!loading && !error && entries.map(rec => (
          <EntryRow
            key={rec.id}
            rec={rec}
            expanded={expandedId === rec.id}
            onToggle={() => toggle(rec.id)}
          />
        ))}
      </div>
    </>
  )
}
