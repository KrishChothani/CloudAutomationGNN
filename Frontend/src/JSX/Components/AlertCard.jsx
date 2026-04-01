/**
 * AlertCard.jsx
 * ─────────────
 * Displays a single cloud anomaly alert with:
 *   - Resource type icon and name
 *   - Severity badge (CRITICAL / HIGH / MEDIUM / LOW) derived from anomaly score
 *   - Animated left-border pulse for CRITICAL alerts
 *   - Anomaly score progress bar
 *   - Relative timestamp via date-fns
 *   - "View Explanation" button → calls onExplain(alert)
 *   - "Dismiss" button → calls onDismiss(id) and hides the card
 *
 * Props: alert (object), onExplain (function), onDismiss (function)
 * Rule compliance: functional component, Tailwind CSS, PropTypes, mock-safe
 */

import { useState } from 'react'
import PropTypes from 'prop-types'
import { formatDistanceToNow } from 'date-fns'
import {
  MdComputer, MdStorage, MdCode, MdCloud, MdBalance,
  MdWarning, MdError, MdInfo, MdCheckCircle,
  MdVisibility, MdClose, MdSchedule,
} from 'react-icons/md'

// ─── Severity configuration ───────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  CRITICAL: {
    label:      'CRITICAL',
    Icon:       MdError,
    textColor:  '#f87171',
    bg:         'rgba(239,68,68,0.10)',
    border:     'rgba(239,68,68,0.28)',
    borderLeft: '#ef4444',
    badge:      { bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.35)' },
    pulse:      true,
  },
  HIGH: {
    label:      'HIGH',
    Icon:       MdWarning,
    textColor:  '#fb923c',
    bg:         'rgba(249,115,22,0.07)',
    border:     'rgba(249,115,22,0.22)',
    borderLeft: '#f97316',
    badge:      { bg: 'rgba(249,115,22,0.15)', color: '#fb923c', border: 'rgba(249,115,22,0.32)' },
    pulse:      false,
  },
  MEDIUM: {
    label:      'MEDIUM',
    Icon:       MdInfo,
    textColor:  '#fbbf24',
    bg:         'rgba(245,158,11,0.06)',
    border:     'rgba(245,158,11,0.18)',
    borderLeft: '#f59e0b',
    badge:      { bg: 'rgba(245,158,11,0.14)', color: '#fbbf24', border: 'rgba(245,158,11,0.28)' },
    pulse:      false,
  },
  LOW: {
    label:      'LOW',
    Icon:       MdCheckCircle,
    textColor:  '#34d399',
    bg:         'rgba(16,185,129,0.05)',
    border:     'rgba(16,185,129,0.16)',
    borderLeft: '#10b981',
    badge:      { bg: 'rgba(16,185,129,0.12)', color: '#34d399', border: 'rgba(16,185,129,0.28)' },
    pulse:      false,
  },
}

/**
 * Returns the severity key string based on an anomaly score.
 * @param {number} score - Anomaly score in range [0, 1]
 * @returns {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'}
 */
function getSeverityKey(score) {
  if (score >= 0.85) return 'CRITICAL'
  if (score >= 0.65) return 'HIGH'
  if (score >= 0.35) return 'MEDIUM'
  return 'LOW'
}

/** Maps resource type strings to Material Design icon components. */
const TYPE_ICONS = {
  EC2:    MdComputer,
  RDS:    MdStorage,
  Lambda: MdCode,
  S3:     MdCloud,
  ELB:    MdBalance,
}

// ─── AlertCard component ──────────────────────────────────────────────────────
/**
 * AlertCard
 * @param {object}   props
 * @param {object}   props.alert         - Alert data object
 * @param {string}   props.alert.id      - Unique alert ID
 * @param {string}   props.alert.resourceName - Display name of the resource
 * @param {string}   props.alert.resourceType - 'EC2' | 'RDS' | 'Lambda' | 'S3' | 'ELB'
 * @param {number}   props.alert.anomalyScore - Score in [0, 1]
 * @param {Date}     props.alert.timestamp    - When the anomaly was detected
 * @param {string}   props.alert.cause        - Short description of root cause
 * @param {Function} props.onExplain    - Called with full alert object when "View Explanation" clicked
 * @param {Function} props.onDismiss    - Called with alert.id when card dismissed
 */
export default function AlertCard({ alert, onExplain, onDismiss }) {
  const {
    id           = 'unknown',
    resourceName = 'unknown-resource',
    resourceType = 'EC2',
    anomalyScore = 0,
    timestamp    = new Date(),
    cause        = 'Anomaly detected in resource metrics',
  } = alert || {}

  const [isDismissed, setIsDismissed] = useState(false)

  const sevKey   = getSeverityKey(anomalyScore)
  const sev      = SEVERITY_CONFIG[sevKey]
  const { Icon: SevIcon } = sev
  const TypeIcon  = TYPE_ICONS[resourceType] || MdComputer
  const timeAgo   = formatDistanceToNow(new Date(timestamp), { addSuffix: true })

  const handleDismiss = () => {
    setIsDismissed(true)
    onDismiss?.(id)
  }

  if (isDismissed) return null

  return (
    <div
      id={`alert-card-${id}`}
      className="relative rounded-xl overflow-hidden transition-all duration-300"
      style={{ background: sev.bg, border: `1px solid ${sev.border}` }}
    >
      {/* Animated left accent — pulses for CRITICAL */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${sev.pulse ? 'animate-pulse' : ''}`}
        style={{ background: sev.borderLeft }}
      />

      <div className="p-4 pl-5">

        {/* ── Top row ── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
              style={{ background: `${sev.borderLeft}18`, border: `1px solid ${sev.borderLeft}30` }}
            >
              <TypeIcon size={16} style={{ color: sev.textColor }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {resourceName}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{resourceType}</p>
            </div>
          </div>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
            style={{
              background: sev.badge.bg,
              color:      sev.badge.color,
              border:     `1px solid ${sev.badge.border}`,
            }}
          >
            <SevIcon size={11} />
            {sev.label}
          </div>
        </div>

        {/* ── Score bar ── */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Anomaly Score</span>
            <span className="text-xs font-black" style={{ color: sev.textColor }}>
              {(anomalyScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width:      `${anomalyScore * 100}%`,
                background: `linear-gradient(90deg, ${sev.borderLeft}60, ${sev.borderLeft})`,
              }}
            />
          </div>
        </div>

        {/* ── Cause text ── */}
        <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {cause}
        </p>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <MdSchedule size={12} />
            <span className="text-xs">{timeAgo}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              id={`alert-dismiss-${id}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all hover:bg-white/5"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            >
              <MdClose size={11} /> Dismiss
            </button>
            <button
              onClick={() => onExplain?.(alert)}
              id={`alert-explain-${id}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: `${sev.borderLeft}18`,
                color:       sev.textColor,
                border:      `1px solid ${sev.borderLeft}30`,
              }}
            >
              <MdVisibility size={12} /> View Explanation
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────
AlertCard.propTypes = {
  /** Alert data object */
  alert: PropTypes.shape({
    id:           PropTypes.string.isRequired,
    resourceName: PropTypes.string,
    resourceType: PropTypes.oneOf(['EC2', 'RDS', 'Lambda', 'S3', 'ELB']),
    anomalyScore: PropTypes.number,
    timestamp:    PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    cause:        PropTypes.string,
  }).isRequired,
  /** Called with the full alert object when "View Explanation" is clicked */
  onExplain: PropTypes.func,
  /** Called with the alert ID when the card is dismissed */
  onDismiss: PropTypes.func,
}

AlertCard.defaultProps = {
  onExplain: null,
  onDismiss: null,
}
