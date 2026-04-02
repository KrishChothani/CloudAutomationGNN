import { useEffect, useState } from 'react'
import { MdClose, MdMemory, MdStorage, MdSpeed, MdWifi, MdErrorOutline, MdCheckCircle } from 'react-icons/md'
import apiClient from '../../services/apiClient.js'

const METRIC_ICONS = {
  cpu: MdSpeed,
  memory: MdMemory,
  disk: MdStorage,
  network: MdWifi,
}

function MetricBar({ label, value, max = 100, unit = '%', color }) {
  const pct = Math.min(100, (value / max) * 100)
  const barColor = pct > 85 ? '#f43f5e' : pct > 70 ? '#f59e0b' : color || '#6366f1'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="text-xs font-bold mono" style={{ color: barColor }}>
          {value}{unit}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}80, ${barColor})` }}
        />
      </div>
    </div>
  )
}

export default function NodeDetailModal({ node, onClose }) {
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!node) return;
    
    let isMounted = true;
    const fetchMetrics = async () => {
      try {
        const response = await apiClient.get(`/events?resourceId=${node.id}&limit=1`)
        if (isMounted && response.data?.data?.events?.length > 0) {
          setMetrics(response.data.data.events[0].metrics)
        }
      } catch (error) {
        console.error("Failed to fetch node metrics:", error)
      }
    }

    fetchMetrics()
    const intervalId = setInterval(fetchMetrics, 5000) // Poll every 5s for real-time
    return () => {
      isMounted = false;
      clearInterval(intervalId)
    }
  }, [node])

  if (!node) return null

  const cpu = metrics?.cpuUsage ?? node.cpuUsage ?? 0
  const memory = metrics?.memoryUsage ?? 0
  const disk = metrics?.diskUsage ?? 0
  const networkBits = ((metrics?.networkIn || 0) + (metrics?.networkOut || 0)) * 8
  const networkMbps = metrics ? (networkBits / 1000000).toFixed(2) : 0

  const typeConfig = {
    ec2: { label: 'EC2 Instance', color: '#6366f1' },
    rds: { label: 'RDS Database', color: '#06b6d4' },
    lambda: { label: 'Lambda Function', color: '#10b981' },
    s3: { label: 'S3 Bucket', color: '#f59e0b' },
    elb: { label: 'Load Balancer', color: '#8b5cf6' },
  }

  const typeCfg = typeConfig[node.nodeType] || { label: 'Cloud Resource', color: '#6366f1' }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        {/* Modal */}
        <div
          className="rounded-2xl w-full max-w-md animate-fade-up overflow-hidden"
          style={{
            background: 'var(--bg-card)',
            border: `1px solid ${typeCfg.color}30`,
            boxShadow: `0 0 40px ${typeCfg.color}20, 0 20px 60px rgba(0,0,0,0.5)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border-subtle)', background: `${typeCfg.color}0a` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${typeCfg.color}15`, border: `1px solid ${typeCfg.color}30` }}
              >
                <span className="text-xl">
                  {node.nodeType === 'ec2' ? '🖥️' : node.nodeType === 'rds' ? '🗄️' : node.nodeType === 'lambda' ? 'λ' : node.nodeType === 's3' ? '🪣' : '⚖️'}
                </span>
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{node.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium" style={{ color: typeCfg.color }}>{typeCfg.label}</span>
                  {node.isAnomaly && (
                    <span className="status-badge status-critical text-xs">
                      <MdErrorOutline size={10} /> Anomaly
                    </span>
                  )}
                  {!node.isAnomaly && (
                    <span className="status-badge status-low text-xs">
                      <MdCheckCircle size={10} /> Healthy
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <MdClose size={18} />
            </button>
          </div>

          {/* Metrics */}
          <div className="p-6 flex flex-col gap-4">
            <MetricBar label="CPU Utilization" value={cpu ? Math.round(cpu) : 0} color={typeCfg.color} />
            <MetricBar label="Memory Usage" value={memory ? Math.round(memory) : 0} color={typeCfg.color} />
            <MetricBar label="Disk I/O" value={disk ? Math.round(disk) : 0} color={typeCfg.color} />
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Network Throughput</span>
              <span className="text-xs font-bold mono" style={{ color: typeCfg.color }}>{networkMbps} Mbps</span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[
                { label: 'Node ID', value: node.id },
                { label: 'Region', value: 'ap-south-1' },
                { label: 'Availability Zone', value: 'ap-south-1a' },
                { label: 'Status', value: node.isAnomaly ? 'DEGRADED' : 'RUNNING' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="text-xs font-semibold font-mono truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
