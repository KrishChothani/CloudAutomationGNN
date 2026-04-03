/**
 * DashboardPage.jsx
 * ─────────────────
 * Main authenticated view for CloudAutomationGNN.
 * All data fetched from real API. Polls stats every 30 s.
 */

import { useState, useEffect, useContext } from 'react'
import PropTypes from 'prop-types'
import {
  MdCloud, MdErrorOutline, MdAutoFixHigh, MdShowChart,
  MdKeyboardArrowRight,
} from 'react-icons/md'
import Sidebar         from '../Components/Sidebar.jsx'
import ResourceGraph   from '../Components/ResourceGraph.jsx'
import MetricsChart    from '../Components/MetricsChart.jsx'
import AlertCard       from '../Components/AlertCard.jsx'
import AutomationLog   from '../Components/AutomationLog.jsx'
import XAIPanel        from '../Components/XAIPanel.jsx'
import NodeDetailModal from '../Components/NodeDetailModal.jsx'
import AuthContext     from '../Contexts/AuthContext.js'
import apiClient       from '../../services/apiClient.js'
import { socketService } from '../../services/socket.js'
import { Link }        from 'react-router-dom'

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, delta, color, loading }) {
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
        {loading ? (
          <div className="h-8 w-16 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
        ) : (
          <p className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>{value}</p>
        )}
        <p className="text-xs font-medium uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
    </div>
  )
}

StatCard.propTypes = {
  icon:    PropTypes.elementType.isRequired,
  label:   PropTypes.string.isRequired,
  value:   PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  delta:   PropTypes.string.isRequired,
  color:   PropTypes.string.isRequired,
  loading: PropTypes.bool,
}
StatCard.defaultProps = { loading: false }

// ─── Component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useContext(AuthContext)

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [detailNode,     setDetailNode]     = useState(null)
  const [xaiAlert,       setXaiAlert]       = useState(null)

  const [stats,      setStats]      = useState(null)
  const [topAlerts,  setTopAlerts]  = useState([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [alertsLoading, setAlertsLoading] = useState(true)

  // ── Fetch dashboard stats ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        const res = await apiClient.get('/events/stats')
        setStats(res.data.data)
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err)
      } finally {
        setStatsLoading(false)
      }
    }

    fetchStats()
    
    // Socket-based real-time updates (fires immediately when WS event arrives or poll tick)
    const onUpdate = () => fetchStats()
    socketService.subscribe('STATS_UPDATE', onUpdate)
    socketService.subscribe('ANOMALY_UPDATE', onUpdate)
    socketService.subscribe('GRAPH_UPDATE', onUpdate)
    
    // Belt-and-suspenders: hard 30s interval in case socket is slow
    const interval = setInterval(fetchStats, 30_000)
    
    return () => {
      socketService.unsubscribe('STATS_UPDATE', onUpdate)
      socketService.unsubscribe('ANOMALY_UPDATE', onUpdate)
      socketService.unsubscribe('GRAPH_UPDATE', onUpdate)
      clearInterval(interval)
    }
  }, [])

  // ── Fetch top 5 alerts ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setAlertsLoading(true)
        const res = await apiClient.get('/anomalies', {
          params: { limit: 5, sort: 'severity', resolved: false },
        })
        setTopAlerts(res.data.data?.data || [])
      } catch (err) {
        console.error('Failed to fetch top alerts:', err)
      } finally {
        setAlertsLoading(false)
      }
    }

    fetchAlerts()
    
    const onUpdate = () => fetchAlerts()
    socketService.subscribe('ANOMALY_UPDATE', onUpdate)
    
    // Belt-and-suspenders: hard 30s interval fallback
    const interval = setInterval(fetchAlerts, 30_000)
    
    return () => {
      socketService.unsubscribe('ANOMALY_UPDATE', onUpdate)
      clearInterval(interval)
    }
  }, [])

  const handleNodeClick = (nodeData) => {
    setSelectedNodeId(nodeData.id)
    setDetailNode(nodeData)
  }

  const STAT_CARDS = [
    {
      icon:  MdCloud,
      label: 'Total Resources',
      value: stats?.totalResources ?? '—',
      delta: 'Live',
      color: '#6366f1',
    },
    {
      icon:  MdErrorOutline,
      label: 'Active Anomalies',
      value: stats?.activeAnomalies ?? '—',
      delta: 'Unresolved',
      color: '#ef4444',
    },
    {
      icon:  MdAutoFixHigh,
      label: 'Automations Today',
      value: stats?.automationsToday ?? '—',
      delta: 'Today',
      color: '#10b981',
    },
    {
      icon:  MdShowChart,
      label: 'Avg Anomaly Score',
      value: stats?.avgAnomalyScore != null
        ? `${(stats.avgAnomalyScore * 100).toFixed(0)}%`
        : '—',
      delta: 'Avg',
      color: '#f97316',
    },
  ]

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
            Live WebSockets active
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {STAT_CARDS.map((c) => (
            <StatCard key={c.label} {...c} loading={statsLoading} />
          ))}
        </div>

        {/* ── Middle: graph (60%) + alert sidebar (40%) ── */}
        <div className="grid xl:grid-cols-5 gap-5 mb-5">

          {/* Resource graph — 3 of 5 columns */}
          <div className="xl:col-span-3" style={{ minHeight: '460px' }}>
            <ResourceGraph onNodeClick={handleNodeClick} />
          </div>

          {/* Alert sidebar — 2 of 5 columns */}
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
              {alertsLoading ? (
                // Loading skeleton
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="glass-card p-4 animate-pulse"
                       style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="h-3 w-24 rounded mb-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
                    <div className="h-2 w-40 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  </div>
                ))
              ) : topAlerts.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  No active alerts — system healthy 🟢
                </p>
              ) : (
                topAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onExplain={setXaiAlert}
                  />
                ))
              )}
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
        alert={xaiAlert}
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
