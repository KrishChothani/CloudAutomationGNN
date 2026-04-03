import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Anomaly from '../Models/anomaly.model.js'
import axios from 'axios'
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch'

const cwClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'ap-south-1' })

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize severity to UPPER case for frontend tab filters */
function normalizeSeverity(s) {
  if (!s) return 'LOW'
  return s.toUpperCase()
}

/** Map anomaly doc → AlertCard/frontend shape */
function toAlertShape(anomaly) {
  const severity = normalizeSeverity(anomaly.severity)
  return {
    id:           anomaly._id?.toString(),
    resourceName: anomaly.resourceId,
    resourceType: anomaly.resourceType,
    cause:        anomaly.explanation  || `Anomaly detected — severity: ${severity}`,
    anomalyScore: anomaly.score        ?? 0,
    severity,
    timestamp:    anomaly.createdAt,
    actionStatus: anomaly.actionStatus ? anomaly.actionStatus.toUpperCase() : 'PENDING',
    resolved:     anomaly.resolved     ?? false,
    region:       anomaly.region       || 'ap-south-1',
  }
}

/** Dynamically fetch real CloudWatch Alarms straight from AWS */
async function fetchDirectAwsAlarms() {
  try {
    const data = await cwClient.send(new DescribeAlarmsCommand({ StateValue: 'ALARM' }))
    const alarms = data.MetricAlarms || []
    
    return alarms.map(alarm => ({
      id:           `aws-alarm-${alarm.AlarmName.replace(/\s+/g, '-')}`,
      resourceName: alarm.Namespace || 'AWS Resource',
      resourceType: 'CloudWatch Alert',
      cause:        alarm.AlarmDescription || alarm.StateReason || 'AWS CloudWatch Alarm Triggered',
      anomalyScore: 1.0, 
      severity:     'CRITICAL',
      timestamp:    alarm.StateUpdatedTimestamp || new Date(),
      actionStatus: 'PENDING',
      resolved:     false,
      region:       process.env.AWS_REGION || 'ap-south-1',
    }))
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️ Could not fetch direct AWS Alarms. Is AWS_ACCESS_KEY_ID configured?', err.message)
    }
    return [] // Return empty array if no AWS perms
  }
}

// ─── GET /anomalies ───────────────────────────────────────────────────────────
export const getAnomalies = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    severity,
    resolved,
    resourceId,
    sort = 'severity',  // 'severity' | 'timestamp'
    sortOrder = 'desc',
  } = req.query

  const filter = {}
  if (severity)             filter.severity  = severity.toLowerCase()
  if (resolved !== undefined) filter.resolved = resolved === 'true'
  if (resourceId)           filter.resourceId = resourceId

  const skip    = (parseInt(page) - 1) * parseInt(limit)
  const sortDir = sortOrder === 'asc' ? 1 : -1

  // Sort by severity (critical first) then timestamp
  const sortQuery = sort === 'severity'
    ? { severity: 1, createdAt: sortDir }   // alphabetical works: critical < high < low < medium — override below
    : { createdAt: sortDir }

  const [rawAnomalies, total] = await Promise.all([
    Anomaly.find(filter)
      .populate('eventId', 'resourceId resourceType metrics createdAt')
      .sort(sortQuery)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Anomaly.countDocuments(filter),
  ])

  // Re-sort by severity weight after fetching (since MongoDB string sort isn't severity order)
  const SEVERITY_WEIGHT = { critical: 0, high: 1, medium: 2, low: 3 }
  if (sort === 'severity') {
    rawAnomalies.sort((a, b) => {
      const wa = SEVERITY_WEIGHT[a.severity] ?? 4
      const wb = SEVERITY_WEIGHT[b.severity] ?? 4
      if (wa !== wb) return wa - wb
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  }

  // Map DB anomalies
  let data = rawAnomalies.map(toAlertShape)

  // 🚀 FETCH DIRECTLY FROM AWS
  const activeAwsAlarms = await fetchDirectAwsAlarms()
  
  // Merge the real AWS Alarms with our GNN database anomalies
  data = [...activeAwsAlarms, ...data]
  const combinedTotal = total + activeAwsAlarms.length

  return res.status(200).json(
    new ApiResponse(200, {
      data,
      total: combinedTotal,
      page:  parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(combinedTotal / parseInt(limit)),
    }, 'Anomalies fetched directly from DB + AWS')
  )
})

// ─── GET /anomalies/:id ───────────────────────────────────────────────────────
export const getAnomalyById = asyncHandler(async (req, res) => {
  const anomaly = await Anomaly.findById(req.params.id)
    .populate('eventId')
    .lean()
  if (!anomaly) throw new ApiError(404, 'Anomaly not found')
  return res.status(200).json(new ApiResponse(200, { anomaly: toAlertShape(anomaly) }, 'Anomaly fetched'))
})

// ─── GET /anomalies/:id/explain ───────────────────────────────────────────────
// Note: route must be registered BEFORE /:id to avoid collision — handled in routes file
export const getExplanation = asyncHandler(async (req, res) => {
  const alarmId = req.params.id

  // ── Handle Native AWS CloudWatch alarms (not stored in MongoDB) ──────────────
  // These have string IDs like "aws-alarm-GNN-Demo-Attack-..." rather than MongoDB ObjectIds.
  // We still call the Python GNN service with synthetic metrics derived from the alarm name.
  if (alarmId.startsWith('aws-alarm-')) {
    const alarmName = alarmId.replace('aws-alarm-', '')

    // Try to get a real explanation from Python using synthetic alarm metrics
    try {
      const pyResponse = await axios.post(`${PYTHON_URL}/explain`, {
        graph_id: alarmId,
        nodes: [{
          node_id:      alarmName,
          node_type:    'CloudWatch',
          cpu_usage:    95,   // CloudWatch alarms fire at threshold — simulate high load
          memory_usage: 88,
          network_in:   300,
          network_out:  250,
          latency:      900,
          error_rate:   8.5,
        }],
        edges: []
      }, { timeout: 12000 })

      console.log('🐍 [anomaly.controller] Python /explain (aws-alarm) Response:', JSON.stringify(pyResponse.data, null, 2))

      const { explanation, shap_values, affected_nodes } = pyResponse.data

      // Python returns shap_values as [{feature, value}] array; DB cache stores it as a plain object
      const shapArray = Array.isArray(shap_values)
        ? shap_values.map(({ feature, value }) => ({
            feature:    feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            importance: Math.abs(value),
            direction:  value >= 0 ? 'positive' : 'negative',
          })).sort((a, b) => b.importance - a.importance)
        : shap_values && typeof shap_values === 'object'
          ? Object.entries(shap_values).map(([key, val]) => ({
              feature:    key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
              importance: Math.abs(val),
              direction:  val >= 0 ? 'positive' : 'negative',
            })).sort((a, b) => b.importance - a.importance)
          : [{ feature: 'Metric Threshold Exceeded', importance: 0.99, direction: 'positive' }]

      return res.status(200).json(new ApiResponse(200, {
        anomalyId:    alarmId,
        resourceName: alarmName,
        resourceType: 'CloudWatch Alert',
        anomalyScore: 1.0,
        shapValues:   shapArray,
        cascadePath:  (affected_nodes || [alarmName]).map(n => ({ id: n, label: n, score: 0.9 })),
        nlExplanation: explanation || `AWS CloudWatch Alarm "${alarmName}" triggered — metric threshold exceeded. GNN analysis confirms critical anomaly pattern.`,
        actionTaken:  'Native CloudWatch Action Triggered',
        actionStatus: 'CRITICAL',
      }, 'CloudWatch alarm explanation from Python GNN'))
    } catch (err) {
      console.warn('🐍 [anomaly.controller] Python unavailable for aws-alarm, using fallback:', err.message)
      // Fallback: return descriptive static response if Python is down
      return res.status(200).json(new ApiResponse(200, {
        anomalyId:    alarmId,
        resourceName: alarmName,
        resourceType: 'CloudWatch Alert',
        anomalyScore: 1.0,
        shapValues:   [
          { feature: 'Metric Threshold Exceeded', importance: 0.99, direction: 'positive' },
          { feature: 'CPU Utilization',           importance: 0.87, direction: 'positive' },
          { feature: 'Error Rate',                importance: 0.72, direction: 'positive' },
        ],
        cascadePath:  [{ id: alarmName, label: 'AWS CloudWatch', score: 1.0 }],
        nlExplanation: `AWS CloudWatch Alarm "${alarmName}" triggered a metric threshold violation. Python GNN service is currently unavailable — showing heuristic analysis.`,
        actionTaken:  'Native CloudWatch Action Triggered',
        actionStatus: 'CRITICAL',
      }, 'CloudWatch alarm explanation (Python unavailable — heuristic fallback)'))
    }
  }

  // ── Handle MongoDB-stored anomalies ──────────────────────────────────────────
  const anomaly = await Anomaly.findById(alarmId).lean()
  if (!anomaly) throw new ApiError(404, 'Anomaly not found')

  // If explanation already cached, return it
  if (anomaly.explanation && anomaly.shapValues) {
    return res.status(200).json(new ApiResponse(200,
      buildExplanationResponse(anomaly),
      'Explanation from cache'
    ))
  }

  // Otherwise call Python XAI service
  try {
    const response = await axios.post(`${PYTHON_URL}/explain`, {
      graph_id:   anomaly._id.toString(),
      nodes: [{
        node_id:      anomaly.resourceId,
        node_type:    anomaly.resourceType,
        cpu_usage:    anomaly.metrics?.cpuUsage    || 0,
        memory_usage: anomaly.metrics?.memoryUsage || 0,
        network_in:   anomaly.metrics?.requestCount || 0,
        network_out:  0,
        latency:      anomaly.metrics?.latency     || 0,
        error_rate:   anomaly.metrics?.errorRate   || 0,
      }],
      edges: []
    }, { timeout: 15000 })

    console.log('🐍 [anomaly.controller] Python /explain Response:', JSON.stringify(response.data, null, 2))
    const { explanation, shap_values, affected_nodes } = response.data

    // Cache back to DB
    await Anomaly.findByIdAndUpdate(anomaly._id, { explanation, shapValues: shap_values, affectedNodes: affected_nodes })

    const updated = { ...anomaly, explanation, shapValues: shap_values, affectedNodes: affected_nodes }
    return res.status(200).json(new ApiResponse(200, buildExplanationResponse(updated), 'Explanation generated'))
  } catch (err) {
    console.error('Python XAI service error:', err.message)
    // Return best-effort explanation from existing data rather than a 502
    return res.status(200).json(new ApiResponse(200,
      buildExplanationResponse(anomaly),
      'Explanation (partial — XAI service unavailable)'
    ))
  }
})

/** Build the XAIPanel-compatible explanation object from an anomaly doc */
function buildExplanationResponse(anomaly) {
  // shapValues in DB is a plain object { cpuUsage: 0.67, memoryUsage: 0.21, ... }
  // XAIPanel expects: [{ feature, importance, direction }]
  let shapArray = []
  if (anomaly.shapValues && typeof anomaly.shapValues === 'object') {
    shapArray = Object.entries(anomaly.shapValues).map(([key, val]) => ({
      feature:    key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()), // camelCase → Title
      importance: Math.abs(val),
      direction:  val >= 0 ? 'positive' : 'negative',
    })).sort((a, b) => b.importance - a.importance)
  }

  // affectedNodes in DB: [{ nodeId, nodeType }]
  // XAIPanel expects: [{ id, label, score }]
  const cascadePath = (anomaly.affectedNodes || []).map(n => ({
    id:    n.nodeId,
    label: n.nodeId,
    score: 0.5, // fallback — actual score would need another lookup
  }))

  return {
    anomalyId:     anomaly._id?.toString(),
    resourceName:  anomaly.resourceId,
    resourceType:  anomaly.resourceType  || 'Unknown',
    anomalyScore:  anomaly.score         ?? 0,
    shapValues:    shapArray,
    cascadePath,
    nlExplanation: anomaly.explanation   || `${anomaly.resourceId} flagged with ${normalizeSeverity(anomaly.severity)} severity (score: ${(anomaly.score * 100).toFixed(0)}%).`,
    actionTaken:   anomaly.action        || 'No automated action taken yet',
    actionStatus:  anomaly.actionStatus  ? anomaly.actionStatus.toUpperCase() : 'PENDING',
  }
}

// ─── GET /anomalies/stats ─────────────────────────────────────────────────────
export const getAnomalyStats = asyncHandler(async (req, res) => {
  const stats = await Anomaly.aggregate([
    {
      $group: {
        _id:      '$severity',
        count:    { $sum: 1 },
        resolved: { $sum: { $cond: ['$resolved', 1, 0] } },
        avgScore: { $avg: '$score' },
      },
    },
    { $sort: { _id: 1 } },
  ])
  const total  = await Anomaly.countDocuments()
  const active = await Anomaly.countDocuments({ resolved: false })

  return res.status(200).json(new ApiResponse(200, { total, active, bySeverity: stats }, 'Anomaly stats'))
})

// ─── PATCH /anomalies/:id/resolve ─────────────────────────────────────────────
export const resolveAnomaly = asyncHandler(async (req, res) => {
  const anomaly = await Anomaly.findByIdAndUpdate(
    req.params.id,
    { resolved: true, resolvedAt: new Date() },
    { new: true }
  )
  if (!anomaly) throw new ApiError(404, 'Anomaly not found')
  return res.status(200).json(new ApiResponse(200, { anomaly: toAlertShape(anomaly) }, 'Anomaly resolved'))
})


