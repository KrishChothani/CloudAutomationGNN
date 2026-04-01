/**
 * ResourceGraph.jsx
 * ─────────────────
 * Force-directed cloud infrastructure topology graph using Sigma.js + graphology.
 *
 * Features:
 *   - 15 mock cloud resource nodes (EC2, Lambda, RDS, S3, ELB)
 *   - Node colour = anomaly score: green (<0.3) | orange (0.3–0.7) | red (>0.7)
 *   - Edge width = traffic volume (req/s)
 *   - Hover tooltip shows score, type, and traffic
 *   - Click node → calls onNodeClick(nodeData) so parent can open detail modal
 *   - "Relayout" button re-runs ForceAtlas2 with a new seed
 *   - Full legend for anomaly score colours and node types
 *
 * Props: onNodeClick (function) — receives {id, label, nodeType, anomalyScore, traffic}
 * Rule compliance: functional component, hooks only, PropTypes, no real API
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { MdRefresh } from 'react-icons/md'

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_NODES = [
  { id: 'ec2-prod-1',       label: 'EC2-prod-1',       type: 'EC2',    anomalyScore: 0.94, traffic: 850 },
  { id: 'ec2-prod-2',       label: 'EC2-prod-2',       type: 'EC2',    anomalyScore: 0.42, traffic: 420 },
  { id: 'ec2-staging-1',    label: 'EC2-staging-1',    type: 'EC2',    anomalyScore: 0.15, traffic: 120 },
  { id: 'lambda-api',       label: 'λ-api-handler',    type: 'Lambda', anomalyScore: 0.81, traffic: 600 },
  { id: 'lambda-processor', label: 'λ-processor',      type: 'Lambda', anomalyScore: 0.55, traffic: 330 },
  { id: 'lambda-notifier',  label: 'λ-notifier',       type: 'Lambda', anomalyScore: 0.22, traffic: 80  },
  { id: 'rds-primary',      label: 'RDS-primary',      type: 'RDS',    anomalyScore: 0.76, traffic: 700 },
  { id: 'rds-replica-1',    label: 'RDS-replica-1',    type: 'RDS',    anomalyScore: 0.31, traffic: 250 },
  { id: 'rds-replica-2',    label: 'RDS-replica-2',    type: 'RDS',    anomalyScore: 0.18, traffic: 190 },
  { id: 's3-assets',        label: 'S3-assets',        type: 'S3',     anomalyScore: 0.08, traffic: 300 },
  { id: 's3-logs',          label: 'S3-logs',          type: 'S3',     anomalyScore: 0.12, traffic: 150 },
  { id: 's3-models',        label: 'S3-models',        type: 'S3',     anomalyScore: 0.05, traffic: 60  },
  { id: 'elb-main',         label: 'ELB-main',         type: 'ELB',    anomalyScore: 0.63, traffic: 920 },
  { id: 'ec2-worker-1',     label: 'EC2-worker-1',     type: 'EC2',    anomalyScore: 0.49, traffic: 280 },
  { id: 'ec2-worker-2',     label: 'EC2-worker-2',     type: 'EC2',    anomalyScore: 0.27, traffic: 175 },
]

const MOCK_EDGES = [
  { source: 'elb-main',       target: 'ec2-prod-1',       volume: 900 },
  { source: 'elb-main',       target: 'ec2-prod-2',       volume: 400 },
  { source: 'elb-main',       target: 'ec2-staging-1',    volume: 120 },
  { source: 'ec2-prod-1',     target: 'lambda-api',       volume: 700 },
  { source: 'ec2-prod-2',     target: 'lambda-processor', volume: 320 },
  { source: 'lambda-api',     target: 'rds-primary',      volume: 650 },
  { source: 'lambda-processor', target: 'rds-replica-1', volume: 240 },
  { source: 'rds-primary',    target: 'rds-replica-1',    volume: 400 },
  { source: 'rds-primary',    target: 'rds-replica-2',    volume: 380 },
  { source: 'ec2-prod-1',     target: 's3-assets',        volume: 280 },
  { source: 'lambda-api',     target: 's3-models',        volume: 55  },
  { source: 'lambda-notifier', target: 's3-logs',         volume: 145 },
  { source: 'ec2-worker-1',   target: 'rds-replica-1',    volume: 160 },
  { source: 'ec2-worker-2',   target: 'rds-replica-2',    volume: 120 },
  { source: 'elb-main',       target: 'ec2-worker-1',     volume: 270 },
  { source: 'ec2-prod-1',     target: 'lambda-notifier',  volume: 75  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────
function scoreToColor(score) {
  if (score < 0.3)  return '#22c55e'   // green
  if (score <= 0.7) return '#f97316'   // orange
  return '#ef4444'                      // red
}

function scoreToLabel(score) {
  if (score < 0.3)  return 'LOW'
  if (score <= 0.7) return 'MEDIUM'
  return 'HIGH'
}

function edgeWidth(volume) {
  return Math.max(1, Math.min(6, volume / 200))
}

// Node shapes simulated via size + border color suffix
const TYPE_CONFIG = {
  EC2:    { shape: '⬤', borderColor: '#818cf8', description: 'EC2 Instance' },
  Lambda: { shape: '◆', borderColor: '#06b6d4', description: 'Lambda Function' },
  RDS:    { shape: '▬', borderColor: '#a78bfa', description: 'RDS Database' },
  S3:     { shape: '⬡', borderColor: '#fbbf24', description: 'S3 Bucket' },
  ELB:    { shape: '▲', borderColor: '#34d399', description: 'Load Balancer' },
}

const LEGEND_ITEMS = [
  { color: '#22c55e', label: 'Low  (< 0.3)' },
  { color: '#f97316', label: 'Medium (0.3 – 0.7)' },
  { color: '#ef4444', label: 'High  (> 0.7)' },
]

// ─── Component ─────────────────────────────────────────────────────────────────
export default function ResourceGraph({ onNodeClick }) {
  const containerRef = useRef(null)
  const sigmaRef     = useRef(null)
  const graphRef     = useRef(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [layoutKey, setLayoutKey] = useState(0)

  const buildGraph = useCallback(() => {
    const graph = new Graph({ multi: false })

    MOCK_NODES.forEach((node, i) => {
      const angle  = (i / MOCK_NODES.length) * 2 * Math.PI
      const radius = 180
      graph.addNode(node.id, {
        label:        node.label,
        x:            Math.cos(angle) * radius + (Math.random() - 0.5) * 60,
        y:            Math.sin(angle) * radius + (Math.random() - 0.5) * 60,
        size:         node.type === 'ELB' ? 18 : node.type === 'RDS' ? 14 : 11,
        color:        scoreToColor(node.anomalyScore),
        borderColor:  TYPE_CONFIG[node.type]?.borderColor || '#64748b',
        // custom attrs
        nodeType:     node.type,
        anomalyScore: node.anomalyScore,
        traffic:      node.traffic,
        originalColor: scoreToColor(node.anomalyScore),
      })
    })

    MOCK_EDGES.forEach((edge, i) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdge(edge.source, edge.target, {
          size:   edgeWidth(edge.volume),
          color:  'rgba(148,163,184,0.18)',
          volume: edge.volume,
        })
      }
    })

    return graph
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    // Cleanup previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill()
      sigmaRef.current = null
    }

    const graph = buildGraph()
    graphRef.current = graph

    // Run ForceAtlas2 layout
    const positions = forceAtlas2(graph, {
      iterations: 100,
      settings: {
        gravity: 1,
        scalingRatio: 8,
        strongGravityMode: false,
        barnesHutOptimize: false,
      },
    })
    forceAtlas2.assign(graph, { iterations: 100 })

    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels:        false,
      defaultEdgeColor:        'rgba(148,163,184,0.2)',
      defaultNodeColor:        '#6366f1',
      labelColor:              { color: '#94a3b8' },
      labelSize:               10,
      labelWeight:             '500',
      labelFont:               'Inter, sans-serif',
      edgeLabelSize:           9,
      minCameraRatio:          0.3,
      maxCameraRatio:          3,
      nodeProgramClasses:      {},
      // Per-node reducer — highlight on hover/select
      nodeReducer: (node, attrs) => {
        const isHovered  = hoveredNode === node
        const isSelected = selectedNode === node
        return {
          ...attrs,
          size:    isHovered || isSelected ? attrs.size * 1.5 : attrs.size,
          color:   attrs.color,
          zIndex:  isHovered || isSelected ? 1 : 0,
          label:   attrs.label,
        }
      },
      edgeReducer: (edge, attrs) => ({
        ...attrs,
        size: attrs.size,
      }),
    })

    renderer.on('enterNode', ({ node }) => setHoveredNode(node))
    renderer.on('leaveNode', ()         => setHoveredNode(null))
    renderer.on('clickNode', ({ node }) => {
      setSelectedNode(node)
      const attrs = graph.getNodeAttributes(node)
      onNodeClick?.({
        id:           node,
        label:        attrs.label,
        nodeType:     attrs.nodeType,
        anomalyScore: attrs.anomalyScore,
        traffic:      attrs.traffic,
      })
    })

    sigmaRef.current = renderer
    return () => { renderer.kill() }
  }, [layoutKey, buildGraph]) // eslint-disable-line

  return (
    <div className="glass-card flex flex-col h-full" style={{ minHeight: '420px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b flex-shrink-0"
           style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            Infrastructure Resource Graph
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {MOCK_NODES.length} nodes · {MOCK_EDGES.length} connections · click node for details
          </p>
        </div>
        <button onClick={() => setLayoutKey(k => k + 1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:bg-indigo-500/10"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
          <MdRefresh size={14} /> Relayout
        </button>
      </div>

      {/* Canvas */}
      <div className="relative flex-1" style={{ minHeight: '320px' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />

        {/* Hover tooltip */}
        {hoveredNode && (() => {
          const node = MOCK_NODES.find(n => n.id === hoveredNode)
          if (!node) return null
          return (
            <div className="absolute top-3 left-3 rounded-xl p-3 text-xs pointer-events-none z-10"
                 style={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(99,102,241,0.3)',
                          backdropFilter: 'blur(8px)', minWidth: '160px' }}>
              <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{node.label}</p>
              <p style={{ color: 'var(--text-muted)' }}>Type: <span style={{ color: '#818cf8' }}>{node.type}</span></p>
              <p style={{ color: 'var(--text-muted)' }}>Score: <span style={{ color: scoreToColor(node.anomalyScore) }}>{(node.anomalyScore * 100).toFixed(0)}%</span></p>
              <p style={{ color: 'var(--text-muted)' }}>Traffic: <span style={{ color: '#34d399' }}>{node.traffic} req/s</span></p>
              <p className="text-xs mt-1 font-semibold" style={{ color: scoreToColor(node.anomalyScore) }}>
                {scoreToLabel(node.anomalyScore)} RISK
              </p>
            </div>
          )
        })()}

        {/* Anomaly counter badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
             style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {MOCK_NODES.filter(n => n.anomalyScore > 0.7).length} High-Risk
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t flex flex-wrap gap-5" style={{ borderColor: 'var(--border-subtle)' }}>
        {/* Color scale */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Anomaly Score</p>
          <div className="flex items-center gap-3">
            {LEGEND_ITEMS.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Node types */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Node Types</p>
          <div className="flex items-center gap-4">
            {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="text-base" style={{ color: cfg.borderColor }}>{cfg.shape}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Edge note */}
        <div className="flex flex-col gap-1 ml-auto">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Edge Width</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>= Traffic volume (req/s)</p>
        </div>
      </div>
    </div>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────
ResourceGraph.propTypes = {
  /**
   * Called when user clicks a node in the graph.
   * Receives {id, label, nodeType, anomalyScore, traffic}.
   */
  onNodeClick: PropTypes.func,
}

ResourceGraph.defaultProps = {
  onNodeClick: null,
}
