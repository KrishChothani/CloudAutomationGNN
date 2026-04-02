/**
 * AutomationLog.jsx
 * ─────────────────
 * Vertical timeline of automated remediation actions taken by the system.
 * Data fetched from GET /api/v1/automation/logs and polled every 20 seconds.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { formatDistanceToNow } from 'date-fns'
import {
  MdRestartAlt, MdWarning, MdBlock,
  MdCheckCircle, MdSchedule, MdRefresh,
} from 'react-icons/md'
import { FiZoomIn } from 'react-icons/fi'
import { getAutomationLogs } from '../../services/automationApi.js'

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  SUCCESS: { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', border: 'rgba(16,185,129,0.28)', dot: '#10b981' },
  FAILED:  { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.3)',   dot: '#ef4444' },
  PENDING: { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', border: 'rgba(245,158,11,0.28)', dot: '#f59e0b' },
}

// ─── Action icon ──────────────────────────────────────────────────────────────
function ActionIcon({ type, status }) {
  const color = STATUS_STYLE[status]?.dot || '#6366f1'
  const Icon  = {
    scale:   FiZoomIn,
    restart: MdRestartAlt,
    alert:   MdWarning,
    block:   MdBlock,
  }[type] || MdCheckCircle

  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10"
      style={{ background: `${color}18`, border: `2px solid ${color}50` }}
    >
      <Icon size={15} style={{ color }} />
    </div>
  )
}

ActionIcon.propTypes = {
  type:   PropTypes.oneOf(['scale', 'restart', 'alert', 'block']).isRequired,
  status: PropTypes.oneOf(['SUCCESS', 'FAILED', 'PENDING']).isRequired,
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AutomationLog() {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const prevLogIds = useRef(new Set())

  const fetchLogs = useCallback(async (isPolling = false) => {
    try {
      if (!isPolling) setLoading(true)
      const res  = await getAutomationLogs({ limit: 20 })
      const data = res.data.data?.logs || []

      // Mark newly appeared entries as "isNew"
      const enriched = data.map(log => ({
        ...log,
        isNew: isPolling && !prevLogIds.current.has(log.id),
      }))

      // Update known IDs set
      prevLogIds.current = new Set(data.map(l => l.id))

      setLogs(enriched)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch automation logs:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Initial load + poll every 20s ─────────────────────────────────────────
  useEffect(() => {
    fetchLogs(false)
    const interval = setInterval(() => fetchLogs(true), 20000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  const successCount = logs.filter(l => l.status === 'SUCCESS').length
  const failedCount  = logs.filter(l => l.status === 'FAILED').length
  const pendingCount = logs.filter(l => l.status === 'PENDING').length

  return (
    <div className="glass-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b flex-shrink-0"
           style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            Automation Log
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : `${logs.length} actions · polls every 20s`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini stats */}
          {[
            { count: successCount, label: 'OK',   style: STATUS_STYLE.SUCCESS },
            { count: failedCount,  label: 'ERR',  style: STATUS_STYLE.FAILED  },
            { count: pendingCount, label: 'WAIT', style: STATUS_STYLE.PENDING },
          ].filter(s => s.count > 0).map(({ count, label, style }) => (
            <span key={label} className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
              {count} {label}
            </span>
          ))}
          <button
            id="automation-log-refresh"
            onClick={() => fetchLogs(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:bg-indigo-500/10"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            <MdRefresh size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-5 py-4">

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-500" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="text-xs py-4 text-center" style={{ color: '#f87171' }}>
            ⚠️ {error} — retrying every 20s
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && logs.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              No automation actions yet.<br />
              They will appear here when anomalies trigger remediations.
            </p>
          </div>
        )}

        {/* Log entries */}
        {!loading && logs.length > 0 && (
          <div className="relative">
            {/* Vertical line */}
            <div
              className="absolute left-[17px] top-0 bottom-0 w-px"
              style={{ background: 'var(--border-subtle)' }}
            />

            <div className="flex flex-col gap-0">
              {logs.map((log, i) => {
                const st      = STATUS_STYLE[log.status] || STATUS_STYLE.PENDING
                const isLast  = i === logs.length - 1
                const timeAgo = formatDistanceToNow(new Date(log.timestamp || log.createdAt), { addSuffix: true })

                return (
                  <div
                    key={log.id}
                    className={`flex gap-4 ${!isLast ? 'pb-5' : ''} ${log.isNew ? 'animate-fade-up' : ''}`}
                  >
                    {/* Icon (sits on the vertical line) */}
                    <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                      <ActionIcon type={log.icon || 'alert'} status={log.status || 'PENDING'} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                            {log.title}
                            {log.isNew && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded font-bold"
                                    style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: '10px' }}>
                                NEW
                              </span>
                            )}
                          </p>
                          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            {log.description}
                          </p>
                        </div>
                        {/* Status badge */}
                        <span
                          className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                        >
                          {log.status}
                        </span>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <MdSchedule size={10} />
                          <span style={{ fontSize: '10px' }}>{timeAgo}</span>
                        </div>
                        {log.anomalyId && (
                          <>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>·</span>
                            <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                              <span style={{ fontSize: '10px' }}>Anomaly</span>
                              <span
                                className="font-mono"
                                style={{ fontSize: '10px', color: '#818cf8' }}
                              >
                                #{log.anomalyId.slice(-6)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
