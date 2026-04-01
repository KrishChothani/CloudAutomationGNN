/**
 * DashboardPage.jsx
 * ─────────────────
 * Main authenticated view for CloudAutomationGNN.
 *
 * Layout (responsive Tailwind grid):
 *   ┌─────────────────────────────────────────┐
 *   │ Sidebar                              │
 *   ├─────────────────────────────────────────┤
 *   │ [stat] [stat] [stat]  [stat]          │
 *   ├─────────────────────────────────────────┤
 *   │ ResourceGraph (60%) │ Top-5 Alerts   │
 *   ├─────────────────────────────────────────┤
 *   │ MetricsChart (50%)  │ AutomationLog  │
 *   └─────────────────────────────────────────┘
 *
 * State:
 *   selectedNodeId — updated when user clicks a graph node → drives MetricsChart
 *   xaiAlert       — alert object passed to XAIPanel drawer
 *   detailNode     — node data passed to NodeDetailModal
 *
 * Data: all mock — MOCK_ALERTS and MOCK_STATS from src/assets/mockData.js
 * Rule compliance: functional component, hooks only, PropTypes, no real API
 */

import { useState, useContext } from 'react'
import PropTypes from 'prop-types'
import {
  MdCloud, MdErrorOutline, MdAutoFixHigh, MdShowChart,
  MdKeyboardArrowRight,
} from 'react-icons/md'
import Sidebar           from '../Components/Sidebar.jsx'
import ResourceGraph     from '../Components/ResourceGraph.jsx'
import MetricsChart      from '../Components/MetricsChart.jsx'
import AlertCard         from '../Components/AlertCard.jsx'
import AutomationLog     from '../Components/AutomationLog.jsx'
import XAIPanel          from '../Components/XAIPanel.jsx'
import NodeDetailModal   from '../Components/NodeDetailModal.jsx'
import AuthContext       from '../Contexts/AuthContext.js'
import { MOCK_ALERTS, MOCK_STATS } from '../../assets/mockData.js'
import { Link } from 'react-router-dom'

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, delta, color }) {
  return (
    <div className="glass-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15`, border: `1px solid ${color}25` }}
        >
          <Icon size={20} style={{ color }} />
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
          {delta}
        </span>
      </div>
      <div>
        <p className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-xs font-medium uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
    </div>
  )
}

StatCard.propTypes = {
  icon:  PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  delta: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useContext(AuthContext)

  // Selected graph node drives MetricsChart
  const [selectedNode,   setSelectedNode]   = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  // XAI panel
  const [xaiAlert, setXaiAlert] = useState(null)

  // Node detail modal
  const [detailNode, setDetailNode] = useState(null)

  const handleNodeClick = (nodeData) => {
    setSelectedNodeId(nodeData.id)
    setDetailNode(nodeData)
  }

  const STAT_CARDS = [
    {
      icon:  MdCloud,
      label: 'Total Resources',
      value: MOCK_STATS.totalResources,
      delta: '+2 today',
      color: '#6366f1',
    },
    {
      icon:  MdErrorOutline,
      label: 'Active Anomalies',
      value: MOCK_STATS.activeAnomalies,
      delta: '↑ from 1',
      color: '#ef4444',
    },
    {
      icon:  MdAutoFixHigh,
      label: 'Automations Today',
      value: MOCK_STATS.automationsToday,
      delta: '↑ 4 auto',
      color: '#10b981',
    },
    {
      icon:  MdShowChart,
      label: 'Avg Anomaly Score',
      value: `${(MOCK_STATS.avgAnomalyScore * 100).toFixed(0)}%`,
      delta: '↓ 3 pts',
      color: '#f97316',
    },
  ]

  // Top 5 alerts for sidebar preview
  const topAlerts = [...MOCK_ALERTS]
    .sort((a, b) => b.anomalyScore - a.anomalyScore)
    .slice(0, 5)

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Dashboard
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Welcome back, {user?.fullName || 'Engineer'} · Real-time cloud intelligence
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
               style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live · Updated just now
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {STAT_CARDS.map((c) => <StatCard key={c.label} {...c} />)}
        </div>

        {/* ── Middle: graph (60%) + alert sidebar (40%) ── */}
        <div className="grid xl:grid-cols-5 gap-5 mb-5">

          {/* Resource graph — 3 of 5 columns = 60% */}
          <div className="xl:col-span-3" style={{ minHeight: '460px' }}>
            <ResourceGraph onNodeClick={handleNodeClick} />
          </div>

          {/* Alert sidebar — 2 of 5 columns = 40% */}
          <div className="xl:col-span-2 flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Top Alerts
              </p>
              <Link to="/alerts"
                className="flex items-center gap-0.5 text-xs font-medium transition-colors hover:opacity-80"
                style={{ color: 'var(--accent-indigo)' }}>
                View all <MdKeyboardArrowRight size={14} />
              </Link>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: '460px' }}>
              {topAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onExplain={setXaiAlert}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom: MetricsChart + AutomationLog ── */}
        <div className="grid xl:grid-cols-2 gap-5">
          <div style={{ minHeight: '380px' }}>
            <MetricsChart initialResource={selectedNodeId || 'ec2-prod-1'} />
          </div>
          <div style={{ minHeight: '380px' }}>
            <AutomationLog />
          </div>
        </div>

      </main>

      {/* ── XAI panel ── */}
      <XAIPanel
        explanation={xaiAlert}
        isOpen={!!xaiAlert}
        onClose={() => setXaiAlert(null)}
      />

      {/* ── Node detail modal ── */}
      {detailNode && (
        <NodeDetailModal node={detailNode} onClose={() => setDetailNode(null)} />
      )}
    </div>
  )
}
