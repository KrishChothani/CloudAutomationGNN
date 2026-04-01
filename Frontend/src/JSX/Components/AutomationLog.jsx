/**
 * AutomationLog.jsx
 * ─────────────────
 * Vertical timeline of automated remediation actions taken by the system.
 *
 * Features:
 *   - 10 pre-loaded mock log entries with mixed SUCCESS / FAILED / PENDING statuses
 *   - Icon per action type: scale (zoom-in) | restart | alert (warning) | block
 *   - Status badge colour-coded: green=SUCCESS, red=FAILED, yellow=PENDING
 *   - Mini stat chips in header showing counts per status
 *   - "Refresh" button prepends a randomly generated new log entry
 *   - New entries animate in with animate-fade-up and show a NEW chip
 *   - Linked anomaly ID displayed in monospace font per entry
 *
 * Props: none (uses internal mock data)
 * Rule compliance: functional component, hooks only, no real API
 */

import { useState } from 'react'
import PropTypes from 'prop-types'
import { formatDistanceToNow } from 'date-fns'
import {
  MdRestartAlt, MdWarning, MdBlock,
  MdCheckCircle, MdSchedule, MdRefresh,
} from 'react-icons/md'
import { FiZoomIn } from 'react-icons/fi'

// ─── Mock Timeline Data ────────────────────────────────────────────────────────
const INITIAL_LOGS = [
  {
    id: 'log-1',
    icon: 'scale',
    title: 'Auto-scaled EC2-prod-1',
    description: 'Increased instance count from 2 to 4 due to CPU anomaly (94%).',
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
    status: 'SUCCESS',
    anomalyId: 'anom-001',
    resource: 'ec2-prod-1',
  },
  {
    id: 'log-2',
    icon: 'alert',
    title: 'PagerDuty Alert Triggered',
    description: 'P1 incident created for RDS-primary connection pool exhaustion.',
    timestamp: new Date(Date.now() - 6 * 60 * 1000),
    status: 'SUCCESS',
    anomalyId: 'anom-002',
    resource: 'rds-primary',
  },
  {
    id: 'log-3',
    icon: 'restart',
    title: 'Restarted λ-api-handler',
    description: 'Cold-start timeout detected. Lambda function force-redeployed.',
    timestamp: new Date(Date.now() - 11 * 60 * 1000),
    status: 'FAILED',
    anomalyId: 'anom-003',
    resource: 'lambda-api',
  },
  {
    id: 'log-4',
    icon: 'scale',
    title: 'Read Replica Promoted',
    description: 'RDS-replica-1 promoted to primary after primary degradation.',
    timestamp: new Date(Date.now() - 18 * 60 * 1000),
    status: 'SUCCESS',
    anomalyId: 'anom-002',
    resource: 'rds-replica-1',
  },
  {
    id: 'log-5',
    icon: 'block',
    title: 'Rate Limiting Applied',
    description: 'ELB-main throttled inbound at 1000 req/s to protect downstream.',
    timestamp: new Date(Date.now() - 25 * 60 * 1000),
    status: 'SUCCESS',
    anomalyId: 'anom-004',
    resource: 'elb-main',
  },
  {
    id: 'log-6',
    icon: 'alert',
    title: 'SNS Notification Sent',
    description: 'Engineering team notified via CloudOps Slack channel.',
    timestamp: new Date(Date.now() - 31 * 60 * 1000),
    status: 'SUCCESS',
    anomalyId: 'anom-004',
    resource: 'sns-cloudops',
  },
  {
    id: 'log-7',
    icon: 'scale',
    title: 'Auto-scaled EC2-worker-1',
    description: 'Worker fleet increased from 1 to 3 instances.',
    timestamp: new Date(Date.now() - 38 * 60 * 1000),
    status: 'PENDING',
    anomalyId: 'anom-005',
    resource: 'ec2-worker-1',
  },
  {
    id: 'log-8',
    icon: 'restart',
    title: 'Memory Flush — RDS-primary',
    description: 'Attempted to flush connection pool cache. Retry in progress.',
    timestamp: new Date(Date.now() - 42 * 60 * 1000),
    status: 'PENDING',
    anomalyId: 'anom-002',
    resource: 'rds-primary',
  },
  {
    id: 'log-9',
    icon: 'block',
    title: 'S3 Lifecycle Policy Updated',
    description: 'Log rotation policy enforced to prevent disk pressure.',
    timestamp: new Date(Date.now() - 55 * 60 * 1000),
    status: 'SUCCESS',
    anomalyId: 'anom-006',
    resource: 's3-logs',
  },
  {
    id: 'log-10',
    icon: 'alert',
    title: 'CloudWatch Alarm Triggered',
    description: 'Alarm: CPUUtilization > 85% for ec2-prod-1 sustained 5 min.',
    timestamp: new Date(Date.now() - 67 * 60 * 1000),
    status: 'SUCCESS',
    anomalyId: 'anom-001',
    resource: 'ec2-prod-1',
  },
]

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
  /** Action type determines which icon is displayed */
  type:   PropTypes.oneOf(['scale', 'restart', 'alert', 'block']).isRequired,
  /** Status determines the icon accent colour */
  status: PropTypes.oneOf(['SUCCESS', 'FAILED', 'PENDING']).isRequired,
}

// ─── Generate a new mock log entry ────────────────────────────────────────────
let counter = 11
function newLogEntry() {
  const types    = ['scale', 'restart', 'alert', 'block']
  const statuses = ['SUCCESS', 'SUCCESS', 'PENDING', 'FAILED']
  const actions  = [
    { title: 'Auto-scaled ec2-prod-2', desc: 'Scaled up to 3 instances after high CPU detected.', res: 'ec2-prod-2' },
    { title: 'Lambda Timeout Resolved', desc: 'λ-processor redeployed with increased memory (1024 MB).', res: 'lambda-processor' },
    { title: 'DynamoDB Throttle Alert', desc: 'Write capacity temporarily exceeded – alert sent.', res: 'dynamodb-events' },
  ]
  const pick = actions[Math.floor(Math.random() * actions.length)]
  return {
    id:          `log-${counter++}`,
    icon:        types[Math.floor(Math.random() * types.length)],
    title:       pick.title,
    description: pick.desc,
    timestamp:   new Date(),
    status:      statuses[Math.floor(Math.random() * statuses.length)],
    anomalyId:   `anom-00${counter}`,
    resource:    pick.res,
    isNew:       true,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AutomationLog() {
  const [logs, setLogs] = useState(INITIAL_LOGS)

  const handleRefresh = () => {
    const entry = newLogEntry()
    setLogs((prev) => [entry, ...prev])
  }

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
            Triggered remediation actions timeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini stats */}
          {[
            { count: successCount, label: 'OK',  style: STATUS_STYLE.SUCCESS },
            { count: failedCount,  label: 'ERR', style: STATUS_STYLE.FAILED  },
            { count: pendingCount, label: 'WAIT',style: STATUS_STYLE.PENDING },
          ].filter(s => s.count > 0).map(({ count, label, style }) => (
            <span key={label} className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
              {count} {label}
            </span>
          ))}
          <button
            id="automation-log-refresh"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:bg-indigo-500/10"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            <MdRefresh size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-[17px] top-0 bottom-0 w-px"
            style={{ background: 'var(--border-subtle)' }}
          />

          <div className="flex flex-col gap-0">
            {logs.map((log, i) => {
              const st      = STATUS_STYLE[log.status] || STATUS_STYLE.SUCCESS
              const isLast  = i === logs.length - 1
              const timeAgo = formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })

              return (
                <div
                  key={log.id}
                  className={`flex gap-4 ${!isLast ? 'pb-5' : ''} ${log.isNew ? 'animate-fade-up' : ''}`}
                >
                  {/* Icon (sits on the vertical line) */}
                  <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                    <ActionIcon type={log.icon} status={log.status} />
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
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>·</span>
                      <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: '10px' }}>Anomaly</span>
                        <span
                          className="font-mono"
                          style={{ fontSize: '10px', color: '#818cf8' }}
                        >
                          #{log.anomalyId}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
