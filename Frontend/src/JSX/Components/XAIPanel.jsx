/**
 * XAIPanel.jsx
 * ────────────
 * Slide-in right-side drawer that explains WHY a node was flagged as anomalous.
 *
 * Sections:
 *   1. Feature Importance — horizontal SHAP bars built with plain CSS (no library)
 *      Red bar = increases anomaly score | Blue bar = decreases anomaly score
 *   2. Cascade Propagation Path — node chips coloured by severity
 *   3. AI-Generated Explanation — natural language explanation block
 *   4. Automated Action — what remediation the system fired + status badge
 *
 * Props:
 *   explanation (object) — explanation data (falls back to demo data if missing)
 *   isOpen      (bool)   — controls visibility; panel slides in when true
 *   onClose     (func)   — called when close button or backdrop clicked
 *
 * Rule compliance: functional component, hooks only, PropTypes, no external chart lib
 */

import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  MdClose, MdAutoAwesome, MdBubbleChart,
  MdTextSnippet, MdAutoFixHigh,
} from 'react-icons/md'

// ─── Demo fallback data ───────────────────────────────────────────────────────
const DEMO_SHAP = [
  { feature: 'CPU %',         importance: 0.67, direction: 'positive' },
  { feature: 'Memory %',      importance: 0.21, direction: 'positive' },
  { feature: 'Latency',       importance: 0.07, direction: 'positive' },
  { feature: 'Error Rate',    importance: 0.03, direction: 'negative' },
  { feature: 'Request Count', importance: 0.02, direction: 'negative' },
]

const DEMO_CASCADE = [
  { id: 'ec2-prod-1',  label: 'EC2-prod-1',    score: 0.94 },
  { id: 'lambda-api',  label: 'λ-api-handler', score: 0.81 },
  { id: 'rds-primary', label: 'RDS-primary',   score: 0.76 },
]

/**
 * Returns colour tokens for a given anomaly score.
 * @param {number} score - Anomaly score [0, 1]
 * @returns {{bg: string, color: string, border: string}}
 */
function scoreColor(score) {
  if (score >= 0.85) return { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', border: 'rgba(239,68,68,0.35)' }
  if (score >= 0.65) return { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', border: 'rgba(249,115,22,0.30)' }
  if (score >= 0.35) return { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.28)' }
  return                    { bg: 'rgba(16,185,129,0.10)', color: '#34d399', border: 'rgba(16,185,129,0.28)' }
}

// ─── SHAP horizontal bar (pure CSS, no recharts) ──────────────────────────────
/**
 * SHAPBar
 * @param {object} props
 * @param {string} props.feature    - Feature name label
 * @param {number} props.importance - Normalised importance score [0, 1]
 * @param {'positive'|'negative'} props.direction - Whether it raises or lowers anomaly score
 */
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
 * XAIPanel
 * @param {object}  props
 * @param {object}  props.explanation             - Explanation data object
 * @param {string}  props.explanation.resourceName
 * @param {string}  props.explanation.resourceType
 * @param {number}  props.explanation.anomalyScore
 * @param {Array}   props.explanation.shapValues   - [{feature, importance, direction}]
 * @param {Array}   props.explanation.cascadePath  - [{id, label, score}]
 * @param {string}  props.explanation.nlExplanation
 * @param {string}  props.explanation.actionTaken
 * @param {string}  props.explanation.actionStatus - 'SUCCESS' | 'FAILED' | 'PENDING'
 * @param {boolean} props.isOpen  - Whether the panel is visible
 * @param {Function} props.onClose - Callback to close the panel
 */
export default function XAIPanel({ explanation, isOpen, onClose }) {
  const panelRef = useRef(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const {
    resourceName  = 'EC2-prod-1',
    resourceType  = 'EC2',
    anomalyScore  = 0.94,
    shapValues    = DEMO_SHAP,
    cascadePath   = DEMO_CASCADE,
    nlExplanation = 'EC2-prod-1 experienced CPU saturation (94%) which propagated through λ-api-handler causing response timeouts, ultimately degrading RDS-primary connection pool by 78%.',
    actionTaken   = 'Auto-scaled EC2 Auto Scaling Group from 2 to 4 instances',
    actionStatus  = 'SUCCESS',
  } = explanation || {}

  const displayShap    = shapValues?.length    ? shapValues    : DEMO_SHAP
  const displayCascade = cascadePath?.length   ? cascadePath   : DEMO_CASCADE
  const scoreStyle     = scoreColor(anomalyScore)

  const actionStyle = {
    SUCCESS: { bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.20)', badgeBg: 'rgba(16,185,129,0.15)', badgeColor: '#34d399', badgeBorder: 'rgba(16,185,129,0.30)' },
    FAILED:  { bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.20)',  badgeBg: 'rgba(239,68,68,0.12)',  badgeColor: '#f87171', badgeBorder: 'rgba(239,68,68,0.28)'  },
    PENDING: { bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.18)', badgeBg: 'rgba(245,158,11,0.12)', badgeColor: '#fbbf24', badgeBorder: 'rgba(245,158,11,0.28)' },
  }[actionStatus] || actionStyle?.SUCCESS

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
                {resourceName} · {resourceType}
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

          {/* Section 1 — SHAP Feature Importance */}
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
              {displayShap.map((s) => (
                <SHAPBar key={s.feature} feature={s.feature} importance={s.importance} direction={s.direction} />
              ))}
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
            </div>
          </section>

          {/* Section 2 — Cascade Path */}
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
              <div className="flex items-center flex-wrap gap-2">
                {displayCascade.map((node, i) => {
                  const cs = scoreColor(node.score)
                  return (
                    <div key={node.id} className="flex items-center gap-2">
                      <span
                        className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono"
                        style={{ background: cs.bg, color: cs.color, border: `1px solid ${cs.border}` }}
                      >
                        {node.label}
                      </span>
                      {i < displayCascade.length - 1 && (
                        <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>→</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                Anomaly propagated across{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>{displayCascade.length} nodes</strong>{' '}
                via graph edges.
              </p>
            </div>
          </section>

          {/* Section 3 — NL Explanation */}
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

          {/* Section 4 — Action Taken */}
          <section aria-labelledby="action-heading">
            <div className="flex items-center gap-2 mb-3">
              <MdAutoFixHigh size={16} color="#10b981" />
              <p id="action-heading" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Automated Action
              </p>
            </div>
            <div
              className="rounded-xl p-4 flex items-center justify-between gap-3"
              style={{ background: actionStyle?.bg, border: `1px solid ${actionStyle?.border}` }}
            >
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{actionTaken}</p>
              <span
                className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: actionStyle?.badgeBg,
                  color:      actionStyle?.badgeColor,
                  border:     `1px solid ${actionStyle?.badgeBorder}`,
                }}
              >
                {actionStatus}
              </span>
            </div>
          </section>

        </div>
      </div>
    </>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────
XAIPanel.propTypes = {
  /** Explanation data — falls back to demo data when null */
  explanation: PropTypes.shape({
    resourceName:  PropTypes.string,
    resourceType:  PropTypes.string,
    anomalyScore:  PropTypes.number,
    shapValues:    PropTypes.arrayOf(PropTypes.shape({
      feature:    PropTypes.string.isRequired,
      importance: PropTypes.number.isRequired,
      direction:  PropTypes.oneOf(['positive', 'negative']).isRequired,
    })),
    cascadePath:   PropTypes.arrayOf(PropTypes.shape({
      id:    PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      score: PropTypes.number.isRequired,
    })),
    nlExplanation: PropTypes.string,
    actionTaken:   PropTypes.string,
    actionStatus:  PropTypes.oneOf(['SUCCESS', 'FAILED', 'PENDING']),
  }),
  /** Whether the panel is open */
  isOpen:  PropTypes.bool.isRequired,
  /** Callback to close the panel */
  onClose: PropTypes.func.isRequired,
}

XAIPanel.defaultProps = {
  explanation: null,
}
