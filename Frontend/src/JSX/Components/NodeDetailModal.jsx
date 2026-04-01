import { useEffect } from 'react'
import { MdClose, MdMemory, MdStorage, MdSpeed, MdWifi, MdErrorOutline, MdCheckCircle } from 'react-icons/md'

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
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!node) return null

  const fakeCPU = node.cpuUsage || Math.round(Math.random() * 80 + 10)
  const fakeMemory = Math.round(Math.random() * 60 + 30)
  const fakeDisk = Math.round(Math.random() * 70 + 15)
  const fakeNetwork = Math.round(Math.random() * 500 + 50)

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
            <MetricBar label="CPU Utilization" value={fakeCPU} color={typeCfg.color} />
            <MetricBar label="Memory Usage" value={fakeMemory} color={typeCfg.color} />
            <MetricBar label="Disk I/O" value={fakeDisk} color={typeCfg.color} />
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Network Throughput</span>
              <span className="text-xs font-bold mono" style={{ color: typeCfg.color }}>{fakeNetwork} Mbps</span>
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
