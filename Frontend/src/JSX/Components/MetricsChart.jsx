/**
 * MetricsChart.jsx
 * ────────────────
 * Live resource metrics visualiser — 3 stacked Recharts line charts.
 * Data fetched from GET /api/v1/events/:resourceId/metrics and polled every 5s.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { MdArrowDropDown, MdRefresh } from 'react-icons/md'
import apiClient from '../../services/apiClient.js'

// ─── Custom Tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, unit, threshold }) => {
  if (!active || !payload?.length) return null
  const val  = payload[0]?.value
  const over = threshold && val > threshold
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl"
         style={{ background: 'rgba(17,24,39,0.97)', border: '1px solid rgba(99,102,241,0.3)', backdropFilter: 'blur(10px)' }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ color: over ? '#ef4444' : payload[0]?.stroke }}>
        {val}{unit} {over && <span style={{ color: '#ef4444' }}>⚠ Above threshold</span>}
      </p>
    </div>
  )
}

// ─── Single Metric Sub-Chart ─────────────────────────────────────────────────
function MetricSubChart({ data, dataKey, label, color, unit, threshold, height = 140 }) {
  const values = data.map(d => d[dataKey]).filter(v => v !== null && v !== undefined)
  const maxVal = values.length > 0 ? Math.max(...values) * 1.15 : 100

  return (
    <div>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {data[data.length - 1]?.[dataKey] ?? '—'}{unit}
          {threshold && data[data.length - 1]?.[dataKey] > threshold && (
            <span className="ml-2 text-xs font-semibold" style={{ color: '#ef4444' }}>⚠ OVER THRESHOLD</span>
          )}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 10, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.07)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} interval={4} />
          <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, maxVal]} />
          <Tooltip content={<CustomTooltip unit={unit} threshold={threshold} />} />
          {threshold && (
            <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5}
              label={{ value: `${threshold}${unit}`, position: 'right', fill: '#ef4444', fontSize: 9 }} />
          )}
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: color, stroke: '#0a0e1a', strokeWidth: 2 }}
            connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function MetricsChart({ initialResource }) {
  const [selectedResource,  setSelectedResource]  = useState(initialResource || 'ec2-prod-1')
  const [data,              setData]              = useState([])
  const [availableResources, setAvailableResources] = useState([initialResource || 'ec2-prod-1'])
  const [loading,           setLoading]           = useState(true)
  const [error,             setError]             = useState(null)
  const [isRefreshing,      setIsRefreshing]      = useState(false)
  const [dropdownOpen,      setDropdownOpen]      = useState(false)
  const [autoRefresh,       setAutoRefresh]       = useState(true)
  const intervalRef  = useRef(null)
  const dropdownRef  = useRef(null)

  // ── Fetch metrics for the current resource ────────────────────────────────
  const fetchMetrics = useCallback(async (resourceId) => {
    if (!resourceId) return
    try {
      setIsRefreshing(true)
      const res = await apiClient.get(`/events/${resourceId}/metrics`, { params: { limit: 20 } })
      const payload = res.data.data

      if (!payload || payload.count === 0) {
        // No data yet — keep existing data or empty
        if (data.length === 0) setData([])
        return
      }

      // Map { timestamps, cpu, memory, latency } → [{ time, cpu, mem, lat }]
      const chartData = payload.timestamps.map((time, i) => ({
        time,
        cpu: payload.cpu[i]     ?? null,
        mem: payload.memory[i]  ?? null,
        lat: payload.latency[i] ?? null,
      }))

      setData(chartData)
      setError(null)
    } catch (err) {
      console.error(`Failed to fetch metrics for ${resourceId}:`, err)
      setError(err.message)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, []) // eslint-disable-line

  // ── Fetch distinct resource IDs for the dropdown ──────────────────────────
  const fetchResources = useCallback(async () => {
    try {
      // Use graph endpoint to get active resource IDs
      const res = await apiClient.get('/graph')
      const nodes = res.data.data?.nodes || []
      if (nodes.length > 0) {
        const ids = nodes.map(n => n.id)
        setAvailableResources(ids)
        // If current resource isn't in the list, switch to first available
        if (!ids.includes(selectedResource)) {
          setSelectedResource(ids[0])
        }
      }
    } catch (_) {
      // Silently ignore — keep the prop-based default
    }
  }, [selectedResource])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchResources()
  }, []) // eslint-disable-line

  // ── Auto-refresh every 5s ─────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    fetchMetrics(selectedResource)

    if (!autoRefresh) {
      clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => fetchMetrics(selectedResource), 5000)
    return () => clearInterval(intervalRef.current)
  }, [autoRefresh, selectedResource, fetchMetrics])

  // ── Update resource when prop changes (user clicks a graph node) ──────────
  useEffect(() => {
    if (initialResource && initialResource !== selectedResource) {
      setSelectedResource(initialResource)
    }
  }, [initialResource]) // eslint-disable-line

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleResourceChange = (res) => {
    setSelectedResource(res)
    setDropdownOpen(false)
    setLoading(true)
    setData([])
  }

  return (
    <div className="glass-card p-5 flex flex-col gap-4 h-full" id="metrics-chart-container">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Resource Metrics</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : error ? '⚠️ Error loading metrics' : `Live · 5s refresh · ${data.length} data points`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button onClick={() => setAutoRefresh(a => !a)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: autoRefresh ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${autoRefresh ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`,
              color: autoRefresh ? '#34d399' : 'var(--text-muted)',
            }}>
            <MdRefresh size={12} style={{ animation: isRefreshing ? 'spin 0.6s linear' : 'none' }} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>

          {/* Resource dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setDropdownOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
              {selectedResource}
              <MdArrowDropDown size={16} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden w-56 max-h-60 overflow-y-auto"
                   style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
                {availableResources.map(res => (
                  <button key={res} onClick={() => handleResourceChange(res)}
                    className="w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-indigo-500/10"
                    style={{ color: res === selectedResource ? '#818cf8' : 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                    {res}
                    {res === selectedResource && <span className="ml-2" style={{ color: '#818cf8' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && data.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading metrics…</span>
          </div>
        </div>
      )}

      {/* No data state */}
      {!loading && data.length === 0 && !error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            No metrics recorded for <strong style={{ color: '#818cf8' }}>{selectedResource}</strong> yet.<br />
            Data will appear once CloudWatch polling runs.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: '#f87171' }}>⚠️ {error} — retrying every 5s</p>
        </div>
      )}

      {/* Charts */}
      {data.length > 0 && (
        <div className="flex flex-col gap-5 flex-1">
          <div className="rounded-xl p-3" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
            <MetricSubChart data={data} dataKey="cpu" label="CPU Utilization" color="#3b82f6" unit="%" threshold={80} />
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
            <MetricSubChart data={data} dataKey="mem" label="Memory Usage" color="#8b5cf6" unit="%" threshold={80} />
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.1)' }}>
            <MetricSubChart data={data} dataKey="lat" label="Latency" color="#f97316" unit="ms" height={130} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────
MetricSubChart.propTypes = {
  data:      PropTypes.arrayOf(PropTypes.object).isRequired,
  dataKey:   PropTypes.string.isRequired,
  label:     PropTypes.string.isRequired,
  color:     PropTypes.string.isRequired,
  unit:      PropTypes.string.isRequired,
  threshold: PropTypes.number,
  height:    PropTypes.number,
}
MetricSubChart.defaultProps = { threshold: undefined, height: 140 }

MetricsChart.propTypes = {
  initialResource: PropTypes.string,
}
MetricsChart.defaultProps = { initialResource: 'ec2-prod-1' }
