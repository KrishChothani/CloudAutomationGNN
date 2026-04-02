import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Event from '../Models/event.model.js'
import Anomaly from '../Models/anomaly.model.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function inferResourceType(resourceId) {
  const id = resourceId.toLowerCase()
  if (id.startsWith('ec2') || id.includes('ec2'))     return 'EC2'
  if (id.startsWith('lambda') || id.includes('lambda')) return 'Lambda'
  if (id.startsWith('rds') || id.includes('rds'))     return 'RDS'
  if (id.startsWith('s3') || id.includes('s3'))       return 'S3'
  if (id.startsWith('elb') || id.includes('elb') || id.includes('alb')) return 'ELB'
  if (id.startsWith('ecs') || id.includes('ecs'))     return 'ECS'
  if (id.startsWith('dynamo') || id.includes('dynamo')) return 'DynamoDB'
  return 'Other'
}

// ─── GET /api/v1/graph ────────────────────────────────────────────────────────
/**
 * Builds a node/edge graph from the Event + Anomaly collections.
 *
 * Nodes  — one per unique resourceId, enriched with latest metrics + anomaly score.
 * Edges  — inferred from resource type relationships (EC2→Lambda→RDS pattern)
 *           plus any edges stored in Anomaly.affectedNodes.
 *
 * Response:
 * {
 *   nodes: [{ id, label, type, anomalyScore, metrics, traffic }],
 *   edges: [{ source, target, volume }]
 * }
 */
export const getGraph = asyncHandler(async (req, res) => {
  // ── 1. Get distinct resourceIds and their latest event ──────────────────────
  const latestEvents = await Event.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$resourceId',
        resourceType: { $first: '$resourceType' },
        metrics:      { $first: '$metrics' },
        updatedAt:    { $first: '$createdAt' },
      },
    },
    { $limit: 50 }, // cap at 50 nodes
  ])

  if (latestEvents.length === 0) {
    // No real data yet — return empty graph
    return res.status(200).json(
      new ApiResponse(200, { nodes: [], edges: [] }, 'Graph data (empty — no events yet)')
    )
  }

  // ── 2. Get latest anomaly score per resource ─────────────────────────────────
  const resourceIds = latestEvents.map(e => e._id)
  const latestAnomalies = await Anomaly.aggregate([
    { $match: { resourceId: { $in: resourceIds }, resolved: false } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id:      '$resourceId',
        score:    { $first: '$score' },
        severity: { $first: '$severity' },
      },
    },
  ])

  const anomalyMap = {}
  latestAnomalies.forEach(a => { anomalyMap[a._id] = a })

  // ── 3. Build nodes ───────────────────────────────────────────────────────────
  const nodes = latestEvents.map(ev => {
    const anom = anomalyMap[ev._id]
    const type = ev.resourceType || inferResourceType(ev._id)
    const metrics = ev.metrics || {}
    const traffic = Math.round(
      (metrics.requestCount || 0) + (metrics.networkIn || 0) / 1000
    )

    return {
      id:           ev._id,
      label:        ev._id,
      type,
      anomalyScore: anom ? anom.score : 0,
      severity:     anom ? anom.severity.toUpperCase() : 'LOW',
      metrics: {
        cpu:     metrics.cpuUsage    ?? null,
        memory:  metrics.memoryUsage ?? null,
        latency: metrics.latency     ?? null,
        errorRate:    metrics.errorRate    ?? null,
        requestCount: metrics.requestCount ?? null,
      },
      traffic,
    }
  })

  // ── 4. Build edges (topology inference) ─────────────────────────────────────
  const edges = []
  const addEdge = (source, target, volume = 200) => {
    if (
      source !== target &&
      nodes.find(n => n.id === source) &&
      nodes.find(n => n.id === target)
    ) {
      edges.push({ source, target, volume })
    }
  }

  // Infer edges from type relationships
  const byType = {}
  nodes.forEach(n => {
    if (!byType[n.type]) byType[n.type] = []
    byType[n.type].push(n.id)
  })

  // ELB → EC2 (all)
  ;(byType['ELB'] || []).forEach(elb =>
    (byType['EC2'] || []).forEach(ec2 => addEdge(elb, ec2, 800))
  )
  // EC2 → Lambda
  ;(byType['EC2'] || []).slice(0, 2).forEach(ec2 =>
    (byType['Lambda'] || []).forEach(lam => addEdge(ec2, lam, 500))
  )
  // Lambda → RDS
  ;(byType['Lambda'] || []).forEach(lam =>
    (byType['RDS'] || []).slice(0, 1).forEach(rds => addEdge(lam, rds, 600))
  )
  // RDS primary → replicas
  const rdsList = byType['RDS'] || []
  if (rdsList.length > 1) {
    rdsList.slice(1).forEach(replica => addEdge(rdsList[0], replica, 350))
  }
  // EC2 → S3
  ;(byType['EC2'] || []).slice(0, 1).forEach(ec2 =>
    (byType['S3'] || []).forEach(s3 => addEdge(ec2, s3, 200))
  )

  // Also add edges from Anomaly.affectedNodes cascade paths
  const cascadeAnomalies = await Anomaly.find(
    { resolved: false, affectedNodes: { $exists: true, $ne: [] } },
    { affectedNodes: 1, resourceId: 1 }
  ).limit(10).lean()

  cascadeAnomalies.forEach(an => {
    an.affectedNodes.forEach(affected => {
      addEdge(an.resourceId, affected.nodeId, 300)
    })
  })

  return res.status(200).json(
    new ApiResponse(200, { nodes, edges }, 'Graph data fetched successfully')
  )
})
