/**
 * MetricsChart.jsx
 * ────────────────
 * Live resource metrics visualiser — 3 stacked Recharts line charts:
 *   CPU %  (blue,   threshold 80%)
 *   Memory % (purple, threshold 80%)
 *   Latency ms (orange, no threshold)
 *
 * Features:
 *   - Resource dropdown: switch between 7 mock resources
 *   - Auto-refresh via setInterval every 5 s — appends a new data point
 *   - Red dashed ReferenceLine at threshold value for CPU and Memory
 *   - Live/Paused toggle button
 *
 * Props: initialResource (string) — default resource to display on mount
 * Rule compliance: functional component, hooks only, PropTypes, no real API
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { MdArrowDropDown, MdRefresh } from 'react-icons/md'

// ─── Mock Data Helpers ─────────────────────────────────────────────────────────
const RESOURCES = [
  'ec2-prod-1', 'ec2-prod-2', 'lambda-api', 'rds-primary',
  'elb-main', 'ec2-worker-1', 'lambda-processor',
]

function generateDataPoint(t, resourceId, prev = null) {
  const base = {
    'ec2-prod-1':       { cpu: 88, mem: 75, lat: 320 },
    'ec2-prod-2':       { cpu: 42, mem: 55, lat: 110 },
    'lambda-api':       { cpu: 78, mem: 62, lat: 210 },
    'rds-primary':      { cpu: 71, mem: 84, lat: 450 },
    'elb-main':         { cpu: 58, mem: 47, lat: 95  },
    'ec2-worker-1':     { cpu: 45, mem: 51, lat: 130 },
    'lambda-processor': { cpu: 53, mem: 48, lat: 185 },
  }[resourceId] || { cpu: 50, mem: 50, lat: 150 }

  const jitter = (range) => (Math.random() - 0.5) * range
  const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const prevCpu = prev?.cpu ?? base.cpu
  const prevMem = prev?.mem ?? base.mem
  const prevLat = prev?.lat ?? base.lat

  return {
    time: t,
    cpu:  clamp(Math.round(prevCpu + jitter(12)), 0, 100),
    mem:  clamp(Math.round(prevMem + jitter(8)),  0, 100),
    lat:  clamp(Math.round(prevLat + jitter(60)), 10, 2000),
  }
}

function generateInitialData(resourceId) {
  const now   = Date.now()
  const points = []
  for (let i = 19; i >= 0; i--) {
    const label = new Date(now - i * 15000).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    points.push(generateDataPoint(label, resourceId, points[points.length - 1]))
  }
  return points
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, unit, threshold }) => {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
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
  const maxVal = Math.max(...data.map(d => d[dataKey])) * 1.15

  return (
    <div>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: color }}>{label}</span>
        <span className="text-xs font-bold" style={{ color: color }}>
          {data[data.length - 1]?.[dataKey]}{unit}
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
            dot={false} activeDot={{ r: 4, fill: color, stroke: '#0a0e1a', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function MetricsChart({ initialResource }) {
  const [selectedResource, setSelectedResource] = useState(initialResource || RESOURCES[0])
  const [data, setData]                         = useState(() => generateInitialData(selectedResource))
  const [isRefreshing, setIsRefreshing]         = useState(false)
  const [dropdownOpen, setDropdownOpen]         = useState(false)
  const [autoRefresh, setAutoRefresh]           = useState(true)
  const intervalRef = useRef(null)
  const dropdownRef = useRef(null)

  // Change resource
  const handleResourceChange = useCallback((res) => {
    setSelectedResource(res)
    setData(generateInitialData(res))
    setDropdownOpen(false)
  }, [])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setIsRefreshing(true)
      setData(prev => {
        const now   = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const last  = prev[prev.length - 1]
        const point = generateDataPoint(now, selectedResource, last)
        return [...prev.slice(-19), point]
      })
      setTimeout(() => setIsRefreshing(false), 400)
    }, 5000)
    return () => clearInterval(intervalRef.current)
  }, [autoRefresh, selectedResource])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="glass-card p-5 flex flex-col gap-4 h-full" id="metrics-chart-container">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Resource Metrics</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Live · 5 s refresh · 20 data points</p>
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
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden w-48"
                   style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
                {RESOURCES.map(res => (
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

      {/* Charts */}
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
  /** Initial resource ID to show — must match one of the RESOURCES entries */
  initialResource: PropTypes.string,
}
MetricsChart.defaultProps = { initialResource: 'ec2-prod-1' }
