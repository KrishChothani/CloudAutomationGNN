/**
 * ResourceGraph.jsx
 * ─────────────────
 * Force-directed cloud infrastructure topology graph using Sigma.js + graphology.
 * Data fetched from GET /api/v1/graph and polled every 15 seconds.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { MdRefresh } from 'react-icons/md'
import { getGraph } from '../../services/graphApi.js'
import { socketService } from '../../services/socket.js'

// ─── Helpers ───────────────────────────────────────────────────────────────────
function scoreToColor(score) {
  if (score < 0.3)   return '#22c55e'  // green
  if (score <= 0.7)  return '#f97316'  // orange
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

const TYPE_CONFIG = {
  EC2:    { shape: '⬤', borderColor: '#818cf8', description: 'EC2 Instance' },
  Lambda: { shape: '◆', borderColor: '#06b6d4', description: 'Lambda Function' },
  RDS:    { shape: '▬', borderColor: '#a78bfa', description: 'RDS Database' },
  S3:     { shape: '⬡', borderColor: '#fbbf24', description: 'S3 Bucket' },
  ELB:    { shape: '▲', borderColor: '#34d399', description: 'Load Balancer' },
  ECS:    { shape: '◈', borderColor: '#f43f5e', description: 'ECS Service'  },
  Other:  { shape: '●', borderColor: '#64748b', description: 'Cloud Resource' },
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
  const [hoveredNode,  setHoveredNode]  = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [layoutKey,    setLayoutKey]    = useState(0)

  // Real data
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // ── Fetch graph data from API ───────────────────────────────────────────────
  const fetchGraph = useCallback(async () => {
    try {
      const res = await getGraph()
      const data = res.data.data
      if (data) {
        setGraphData(data)
        setError(null)
      }
    } catch (err) {
      console.error('Failed to fetch graph data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGraph()
    
    const onUpdate = () => fetchGraph()
    socketService.subscribe('GRAPH_UPDATE', onUpdate)
    
    // Independent polling — don't rely solely on the socket/global poll ticker
    const interval = setInterval(fetchGraph, 2_000)
    
    return () => {
      socketService.unsubscribe('GRAPH_UPDATE', onUpdate)
      clearInterval(interval)
    }
  }, [fetchGraph])

  // ── Build Sigma graph from API data ────────────────────────────────────────
  const buildGraph = useCallback(() => {
    const graph = new Graph({ multi: false })
    const nodes = graphData.nodes || []
    const edges = graphData.edges || []

    nodes.forEach((node, i) => {
      const angle  = (i / Math.max(nodes.length, 1)) * 2 * Math.PI
      const radius = 180
      const type   = node.type || 'Other'
      graph.addNode(node.id, {
        label:         node.label || node.id,
        x:             Math.cos(angle) * radius + (Math.random() - 0.5) * 60,
        y:             Math.sin(angle) * radius + (Math.random() - 0.5) * 60,
        size:          type === 'ELB' ? 18 : type === 'RDS' ? 14 : 11,
        color:         scoreToColor(node.anomalyScore ?? 0),
        borderColor:   TYPE_CONFIG[type]?.borderColor || '#64748b',
        nodeType:      type,
        anomalyScore:  node.anomalyScore ?? 0,
        traffic:       node.traffic ?? 0,
        metrics:       node.metrics || {},
        originalColor: scoreToColor(node.anomalyScore ?? 0),
      })
    })

    edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, {
            size:   edgeWidth(edge.volume || 200),
            color:  'rgba(148,163,184,0.18)',
            volume: edge.volume || 200,
          })
        } catch (_) { /* ignore duplicate edges */ }
      }
    })

    return graph
  }, [graphData, layoutKey]) // eslint-disable-line

  // ── Render Sigma when data or layout key changes ───────────────────────────
  useEffect(() => {
    if (!containerRef.current || graphData.nodes.length === 0) return

    if (sigmaRef.current) {
      sigmaRef.current.kill()
      sigmaRef.current = null
    }

    const graph = buildGraph()

    forceAtlas2.assign(graph, { iterations: 100, settings: {
      gravity: 1, scalingRatio: 8, strongGravityMode: false, barnesHutOptimize: false,
    }})

    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels:   false,
      defaultEdgeColor:   'rgba(148,163,184,0.2)',
      defaultNodeColor:   '#6366f1',
      labelColor:         { color: '#94a3b8' },
      labelSize:          10,
      labelWeight:        '500',
      labelFont:          'Inter, sans-serif',
      minCameraRatio:     0.3,
      maxCameraRatio:     3,
      nodeReducer: (node, attrs) => {
        const isHovered  = hoveredNode === node
        const isSelected = selectedNode === node
        return {
          ...attrs,
          size:   isHovered || isSelected ? attrs.size * 1.5 : attrs.size,
          zIndex: isHovered || isSelected ? 1 : 0,
        }
      },
      edgeReducer: (edge, attrs) => ({ ...attrs }),
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
        metrics:      attrs.metrics,
      })
    })

    sigmaRef.current = renderer
    return () => { renderer.kill() }
  }, [graphData, layoutKey, buildGraph]) // eslint-disable-line

  // ── Tooltip node lookup ────────────────────────────────────────────────────
  const hoveredNodeData = hoveredNode
    ? graphData.nodes.find(n => n.id === hoveredNode)
    : null

  const highRiskCount = graphData.nodes.filter(n => (n.anomalyScore ?? 0) > 0.7).length

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
            {loading
              ? 'Loading graph…'
              : `${graphData.nodes.length} nodes · ${graphData.edges.length} connections · click node for details`}
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

        {/* Loading state */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading infrastructure graph…</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <p className="text-xs" style={{ color: '#f87171' }}>
              ⚠️ Failed to load graph — retrying every 15s
            </p>
          </div>
        )}

        {/* Empty state (DB has no events yet) */}
        {!loading && !error && graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              No infrastructure data yet.<br />
              Events will appear once CloudWatch polling starts.
            </p>
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />

        {/* Hover tooltip */}
        {hoveredNodeData && (
          <div className="absolute top-3 left-3 rounded-xl p-3 text-xs pointer-events-none z-10"
               style={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(99,102,241,0.3)',
                        backdropFilter: 'blur(8px)', minWidth: '160px' }}>
            <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{hoveredNodeData.label}</p>
            <p style={{ color: 'var(--text-muted)' }}>Type: <span style={{ color: '#818cf8' }}>{hoveredNodeData.type}</span></p>
            <p style={{ color: 'var(--text-muted)' }}>Score: <span style={{ color: scoreToColor(hoveredNodeData.anomalyScore ?? 0) }}>{((hoveredNodeData.anomalyScore ?? 0) * 100).toFixed(0)}%</span></p>
            {hoveredNodeData.traffic > 0 && (
              <p style={{ color: 'var(--text-muted)' }}>Traffic: <span style={{ color: '#34d399' }}>{hoveredNodeData.traffic} req/s</span></p>
            )}
            <p className="text-xs mt-1 font-semibold" style={{ color: scoreToColor(hoveredNodeData.anomalyScore ?? 0) }}>
              {scoreToLabel(hoveredNodeData.anomalyScore ?? 0)} RISK
            </p>
          </div>
        )}

        {/* Anomaly counter badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
             style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {highRiskCount} High-Risk
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t flex flex-wrap gap-5" style={{ borderColor: 'var(--border-subtle)' }}>
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

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Node Types</p>
          <div className="flex items-center gap-4">
            {Object.entries(TYPE_CONFIG).slice(0, 5).map(([type, cfg]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="text-base" style={{ color: cfg.borderColor }}>{cfg.shape}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 ml-auto">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Updates</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Live WS Stream</p>
        </div>
      </div>
    </div>
  )
}

ResourceGraph.propTypes = {
  onNodeClick: PropTypes.func,
}
ResourceGraph.defaultProps = {
  onNodeClick: null,
}
