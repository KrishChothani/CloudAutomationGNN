/**
 * XAIPanel.jsx
 * ────────────
 * Slide-in right-side drawer that explains WHY a node was flagged as anomalous.
 * Fetches real explanation from GET /api/v1/anomalies/:id/explain when opened.
 */

import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
  MdClose, MdAutoAwesome, MdBubbleChart,
  MdTextSnippet, MdAutoFixHigh,
} from 'react-icons/md'
import apiClient from '../../services/apiClient.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 0.85) return { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.35)' }
  if (score >= 0.65) return { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', border: 'rgba(249,115,22,0.30)' }
  if (score >= 0.35) return { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.28)' }
  return                    { bg: 'rgba(16,185,129,0.10)',  color: '#34d399', border: 'rgba(16,185,129,0.28)' }
}

// ─── SHAP horizontal bar ──────────────────────────────────────────────────────
function SHAPBar({ feature, importance, direction }) {
  const pct   = Math.round(importance * 100)
  const color = direction === 'positive' ? '#ef4444' : '#3b82f6'

  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-right flex-shrink-0">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {feature}
        </span>
      </div>
      <div
        className="flex-1 h-5 rounded-md overflow-hidden relative"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="h-full rounded-md transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}40, ${color})` }}
        />
      </div>
      <div className="w-10 text-right flex-shrink-0">
        <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
      </div>
    </div>
  )
}

SHAPBar.propTypes = {
  feature:    PropTypes.string.isRequired,
  importance: PropTypes.number.isRequired,
  direction:  PropTypes.oneOf(['positive', 'negative']).isRequired,
}

// ─── XAIPanel component ───────────────────────────────────────────────────────
/**
 * Props:
 *   alert   — the alert object from AlertCard (must have .id for API fetch)
 *   isOpen  — whether the panel is visible
 *   onClose — callback to close the panel
 */
export default function XAIPanel({ alert, isOpen, onClose }) {
  const panelRef = useRef(null)
  const [explanation, setExplanation] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // ── Fetch explanation when panel opens ────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !alert?.id) return

    let cancelled = false
    const fetchExplanation = async () => {
      try {
        setLoading(true)
        setError(null)
        setExplanation(null)
        const res = await apiClient.get(`/anomalies/${alert.id}/explain`)
        if (!cancelled) setExplanation(res.data.data)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch explanation:', err)
          setError(err.message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchExplanation()
    return () => { cancelled = true }
  }, [isOpen, alert?.id])

  // ── Close on Escape key ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Use fetched data, fall back to alert object fields while loading
  const resourceName  = explanation?.resourceName  ?? alert?.resourceName  ?? 'Unknown'
  const resourceType  = explanation?.resourceType  ?? alert?.resourceType  ?? ''
  const anomalyScore  = explanation?.anomalyScore  ?? alert?.anomalyScore  ?? 0
  const shapValues    = explanation?.shapValues    ?? []
  const cascadePath   = explanation?.cascadePath   ?? []
  const nlExplanation = explanation?.nlExplanation ?? alert?.cause ?? ''
  const actionTaken   = explanation?.actionTaken   ?? 'No automated action taken yet'
  const actionStatus  = explanation?.actionStatus  ?? alert?.actionStatus ?? 'PENDING'

  const scoreStyle  = scoreColor(anomalyScore)
  const actionStyle = {
    SUCCESS: { bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.20)', badgeBg: 'rgba(16,185,129,0.15)', badgeColor: '#34d399', badgeBorder: 'rgba(16,185,129,0.30)' },
    FAILED:  { bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.20)',  badgeBg: 'rgba(239,68,68,0.12)',  badgeColor: '#f87171', badgeBorder: 'rgba(239,68,68,0.28)'  },
    PENDING: { bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.18)', badgeBg: 'rgba(245,158,11,0.12)', badgeColor: '#fbbf24', badgeBorder: 'rgba(245,158,11,0.28)' },
  }[actionStatus] ?? { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.18)', badgeBg: 'rgba(245,158,11,0.12)', badgeColor: '#fbbf24', badgeBorder: 'rgba(245,158,11,0.28)' }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/55"
        style={{ backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Anomaly explanation panel"
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-y-auto animate-slide-in-right"
        style={{
          width:      'min(520px, 96vw)',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow:  '-24px 0 60px rgba(0,0,0,0.55)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              <MdAutoAwesome size={18} color="#818cf8" />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                Why was this flagged?
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {resourceName} {resourceType ? `· ${resourceType}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black"
              style={{ background: scoreStyle.bg, color: scoreStyle.color, border: `1px solid ${scoreStyle.border}` }}
            >
              {(anomalyScore * 100).toFixed(1)}% ANOMALY
            </div>
            <button
              id="xai-panel-close"
              onClick={onClose}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Close explanation panel"
            >
              <MdClose size={18} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col gap-6 p-6">

          {/* Loading spinner */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Generating explanation from GNN…
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="rounded-xl p-4 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              ⚠️ Could not load full explanation: {error}
            </div>
          )}

          {/* Section 1 — SHAP (only if data available) */}
          {!loading && (
            <section aria-labelledby="shap-heading">
              <div className="flex items-center gap-2 mb-4">
                <MdBubbleChart size={16} color="#6366f1" />
                <p id="shap-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Feature Importance (SHAP)
                </p>
              </div>
              <div
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}
              >
                {shapValues.length > 0 ? (
                  shapValues.map((s) => (
                    <SHAPBar key={s.feature} feature={s.feature} importance={s.importance} direction={s.direction} />
                  ))
                ) : (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                    SHAP values not yet computed for this anomaly.
                  </p>
                )}
                {shapValues.length > 0 && (
                  <div className="flex items-center gap-5 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-2 rounded-sm" style={{ background: '#ef4444' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Raises score</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-2 rounded-sm" style={{ background: '#3b82f6' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Lowers score</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Section 2 — Cascade Path */}
          {!loading && (
            <section aria-labelledby="cascade-heading">
              <div className="flex items-center gap-2 mb-3">
                <MdBubbleChart size={16} color="#06b6d4" />
                <p id="cascade-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Cascade Propagation Path
                </p>
              </div>
              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.15)' }}
              >
                {cascadePath.length > 0 ? (
                  <>
                    <div className="flex items-center flex-wrap gap-2">
                      {cascadePath.map((node, i) => {
                        const cs = scoreColor(node.score ?? 0.5)
                        return (
                          <div key={node.id} className="flex items-center gap-2">
                            <span
                              className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono"
                              style={{ background: cs.bg, color: cs.color, border: `1px solid ${cs.border}` }}
                            >
                              {node.label}
                            </span>
                            {i < cascadePath.length - 1 && (
                              <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>→</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                      Anomaly propagated across{' '}
                      <strong style={{ color: 'var(--text-secondary)' }}>{cascadePath.length} nodes</strong>{' '}
                      via graph edges.
                    </p>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    No cascade propagation detected for this anomaly.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Section 3 — NL Explanation */}
          {!loading && nlExplanation && (
            <section aria-labelledby="nl-heading">
              <div className="flex items-center gap-2 mb-3">
                <MdTextSnippet size={16} color="#8b5cf6" />
                <p id="nl-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  AI-Generated Explanation
                </p>
              </div>
              <div
                className="rounded-xl p-4 text-sm leading-relaxed"
                style={{
                  background: 'rgba(139,92,246,0.06)',
                  border:     '1px solid rgba(139,92,246,0.18)',
                  color:      'var(--text-secondary)',
                  lineHeight: '1.75',
                }}
              >
                {nlExplanation}
              </div>
            </section>
          )}

          {/* Section 4 — Action Taken */}
          {!loading && (
            <section aria-labelledby="action-heading">
              <div className="flex items-center gap-2 mb-3">
                <MdAutoFixHigh size={16} color="#10b981" />
                <p id="action-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Automated Action
                </p>
              </div>
              <div
                className="rounded-xl p-4 flex items-center justify-between gap-3"
                style={{ background: actionStyle.bg, border: `1px solid ${actionStyle.border}` }}
              >
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{actionTaken}</p>
                <span
                  className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: actionStyle.badgeBg,
                    color:      actionStyle.badgeColor,
                    border:     `1px solid ${actionStyle.badgeBorder}`,
                  }}
                >
                  {actionStatus}
                </span>
              </div>
            </section>
          )}

        </div>
      </div>
    </>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────
XAIPanel.propTypes = {
  alert:   PropTypes.shape({
    id:           PropTypes.string,
    resourceName: PropTypes.string,
    resourceType: PropTypes.string,
    anomalyScore: PropTypes.number,
    cause:        PropTypes.string,
    actionStatus: PropTypes.string,
  }),
  isOpen:  PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
}
XAIPanel.defaultProps = {
  alert: null,
}
