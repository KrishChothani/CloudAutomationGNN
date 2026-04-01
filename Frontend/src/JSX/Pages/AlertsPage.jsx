/**
 * AlertsPage.jsx
 * ──────────────
 * Full paginated alert listing page for CloudAutomationGNN.
 *
 * Features:
 *   - Five severity tab filters: All | Critical | High | Medium | Low
 *     Each tab shows a live count badge derived from the current dataset.
 *   - Search input filters by resource name or cause description.
 *   - Alerts sorted by severity (CRITICAL first) then timestamp (newest first).
 *   - 10 alerts per page with prev / next pagination controls.
 *   - Dismiss applies per-session (Set state) — cards vanish without reload.
 *   - Clicking "View Explanation" opens XAIPanel as a right-side drawer.
 *   - Empty state illustration when no alerts match the current filter/query.
 *
 * Data: 15 mock alert objects imported from src/assets/mockData.js
 * Rule compliance: functional component, hooks only, PropTypes, no real API
 */

import { useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { MdSearch, MdInbox, MdKeyboardArrowLeft, MdKeyboardArrowRight } from 'react-icons/md'
import Sidebar   from '../Components/Sidebar.jsx'
import AlertCard from '../Components/AlertCard.jsx'
import XAIPanel  from '../Components/XAIPanel.jsx'
import { MOCK_ALERTS } from '../../assets/mockData.js'

// ─── Config ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10

const TABS = [
  { key: 'ALL',      label: 'All',      color: '#818cf8' },
  { key: 'CRITICAL', label: 'Critical', color: '#f87171' },
  { key: 'HIGH',     label: 'High',     color: '#fb923c' },
  { key: 'MEDIUM',   label: 'Medium',   color: '#fbbf24' },
  { key: 'LOW',      label: 'Low',      color: '#34d399' },
]

function getAlertSeverityKey(score) {
  if (score >= 0.85) return 'CRITICAL'
  if (score >= 0.65) return 'HIGH'
  if (score >= 0.35) return 'MEDIUM'
  return 'LOW'
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ filter, query }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
           style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <MdInbox size={28} color="#6366f1" />
      </div>
      <div className="text-center">
        <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>No alerts found</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {query
            ? `No alerts matching "${query}" ${filter !== 'ALL' ? `in ${filter}` : ''}`
            : `No ${filter !== 'ALL' ? filter.toLowerCase() : ''} alerts at this time`}
        </p>
      </div>
    </div>
  )
}

EmptyState.propTypes = {
  filter: PropTypes.string.isRequired,
  query:  PropTypes.string,
}
EmptyState.defaultProps = { query: '' }

// ─── Pagination control ────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-3 mt-6">
      <button
        onClick={onPrev}
        disabled={page === 1}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30"
        style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        id="alerts-prev-page"
      >
        <MdKeyboardArrowLeft size={16} /> Prev
      </button>

      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => p !== page && (p < page ? onPrev() : onNext())}
            className="w-7 h-7 rounded-lg text-xs font-bold transition-all"
            style={
              p === page
                ? { background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.4)' }
                : { background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
            }
          >
            {p}
          </button>
        ))}
      </div>

      <button
        onClick={onNext}
        disabled={page === totalPages}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all disabled:opacity-30"
        style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        id="alerts-next-page"
      >
        Next <MdKeyboardArrowRight size={16} />
      </button>
    </div>
  )
}

Pagination.propTypes = {
  page:       PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  onPrev:     PropTypes.func.isRequired,
  onNext:     PropTypes.func.isRequired,
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [activeTab, setActiveTab]     = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage]               = useState(1)
  const [xaiAlert, setXaiAlert]       = useState(null)
  const [dismissed, setDismissed]     = useState(new Set())

  // Filter + sort
  const filtered = useMemo(() => {
    return MOCK_ALERTS
      .filter((a) => !dismissed.has(a.id))
      .filter((a) => {
        if (activeTab !== 'ALL' && getAlertSeverityKey(a.anomalyScore) !== activeTab) return false
        if (searchQuery && !a.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !a.cause.toLowerCase().includes(searchQuery.toLowerCase())) return false
        return true
      })
      .sort((a, b) => {
        const sa = SEVERITY_ORDER[getAlertSeverityKey(a.anomalyScore)]
        const sb = SEVERITY_ORDER[getAlertSeverityKey(b.anomalyScore)]
        if (sa !== sb) return sa - sb
        return new Date(b.timestamp) - new Date(a.timestamp)
      })
  }, [activeTab, searchQuery, dismissed])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Tab counts
  const counts = useMemo(() => {
    const base = MOCK_ALERTS.filter((a) => !dismissed.has(a.id))
    return {
      ALL:      base.length,
      CRITICAL: base.filter((a) => getAlertSeverityKey(a.anomalyScore) === 'CRITICAL').length,
      HIGH:     base.filter((a) => getAlertSeverityKey(a.anomalyScore) === 'HIGH').length,
      MEDIUM:   base.filter((a) => getAlertSeverityKey(a.anomalyScore) === 'MEDIUM').length,
      LOW:      base.filter((a) => getAlertSeverityKey(a.anomalyScore) === 'LOW').length,
    }
  }, [dismissed])

  const handleTabChange = (key) => {
    setActiveTab(key)
    setPage(1)
  }

  const handleSearch = (e) => {
    setSearchQuery(e.target.value)
    setPage(1)
  }

  const handleDismiss = (id) => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Alerts</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} alert{filtered.length !== 1 ? 's' : ''} · sorted by severity then time
            </p>
          </div>

          {/* Active anomaly chip */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
               style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {counts.CRITICAL + counts.HIGH} Requires Attention
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="glass-card p-4 mb-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">

            {/* Tab pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {TABS.map(({ key, label, color }) => {
                const count   = counts[key]
                const isActive = activeTab === key
                return (
                  <button
                    key={key}
                    id={`alerts-tab-${key.toLowerCase()}`}
                    onClick={() => handleTabChange(key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={
                      isActive
                        ? { background: `${color}18`, color, border: `1px solid ${color}35` }
                        : { background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
                    }
                  >
                    {label}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                      style={
                        isActive
                          ? { background: `${color}20`, color }
                          : { background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }
                      }
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search */}
            <div className="relative ml-auto w-full sm:w-64">
              <MdSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }} />
              <input
                id="alerts-search"
                type="text"
                placeholder="Search resource or cause…"
                value={searchQuery}
                onChange={handleSearch}
                className="w-full pl-9 pr-4 py-2 rounded-lg text-xs outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border:     '1px solid var(--border-subtle)',
                  color:      'var(--text-primary)',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Alert grid ── */}
        {paginated.length === 0 ? (
          <EmptyState filter={activeTab} query={searchQuery} />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
            {paginated.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onExplain={setXaiAlert}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />

        {/* Showing X–Y of Z */}
        {filtered.length > 0 && (
          <p className="text-center text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} alerts
          </p>
        )}

      </main>

      {/* ── XAI side panel ── */}
      <XAIPanel
        explanation={xaiAlert}
        isOpen={!!xaiAlert}
        onClose={() => setXaiAlert(null)}
      />
    </div>
  )
}
