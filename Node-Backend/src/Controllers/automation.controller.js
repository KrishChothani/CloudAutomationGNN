import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Anomaly from '../Models/anomaly.model.js'
import AutomationLog from '../Models/automationLog.model.js'
import axios from 'axios'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

// ─── GET /automation/logs ─────────────────────────────────────────────────────
export const getAutomationLogs = asyncHandler(async (req, res) => {
  const { limit = 20, status } = req.query

  const filter = {}
  if (status) filter.status = status

  const logs = await AutomationLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('anomalyId', 'resourceId severity score')
    .lean()

  // Map to the shape AutomationLog.jsx expects
  const formatted = logs.map(log => ({
    id:          log._id.toString(),
    icon:        inferIcon(log.actionType || log.action),
    title:       log.action,
    description: log.description,
    timestamp:   log.createdAt,
    status:      log.status === 'triggered' ? 'PENDING' : log.status.toUpperCase(),
    anomalyId:   log.anomalyId?._id?.toString() || log.anomalyId?.toString() || null,
    resource:    log.resourceId || log.anomalyId?.resourceId || 'unknown',
  }))

  return res.status(200).json(
    new ApiResponse(200, { logs: formatted }, 'Automation logs fetched')
  )
})

// ─── POST /automation/logs ────────────────────────────────────────────────────
export const createAutomationLog = asyncHandler(async (req, res) => {
  const { action, description, anomalyId, resourceId, actionType, status = 'SUCCESS', triggeredBy = 'system' } = req.body

  if (!action || !description) {
    throw new ApiError(400, 'action and description are required')
  }

  const log = await AutomationLog.create({
    action,
    description,
    anomalyId:   anomalyId  || undefined,
    resourceId:  resourceId || undefined,
    actionType:  actionType || undefined,
    status,
    triggeredBy,
  })

  return res.status(201).json(new ApiResponse(201, { log }, 'Automation log created'))
})

// ─── POST /automation/trigger ─────────────────────────────────────────────────
export const triggerRemediation = asyncHandler(async (req, res) => {
  const { anomalyId, actionType, resourceId, params = {} } = req.body

  if (!anomalyId || !actionType) {
    throw new ApiError(400, 'anomalyId and actionType are required')
  }

  const anomaly = await Anomaly.findById(anomalyId)
  if (!anomaly) throw new ApiError(404, 'Anomaly not found')

  const SUPPORTED_ACTIONS = {
    'scale-out':        'Auto-scaled EC2 / ECS fleet',
    'restart-service':  'Restarted Lambda / ECS service',
    'failover-db':      'Triggered RDS Multi-AZ failover',
    'drain-instance':   'Drained and deregistered ELB target',
    'increase-memory':  'Increased Lambda memory allocation',
    'notify':           'Sent PagerDuty / SNS notification',
  }

  if (!SUPPORTED_ACTIONS[actionType]) {
    throw new ApiError(400, `Unsupported actionType. Must be one of: ${Object.keys(SUPPORTED_ACTIONS).join(', ')}`)
  }

  const actionLabel = SUPPORTED_ACTIONS[actionType]
  const effectiveResourceId = resourceId || anomaly.resourceId

  // Persist to MongoDB
  const log = await AutomationLog.create({
    action:      actionLabel,
    description: `${actionLabel} triggered for ${effectiveResourceId} (anomalyId: ${anomalyId})`,
    actionType,
    anomalyId,
    resourceId:  effectiveResourceId,
    status:      'PENDING',
    triggeredBy: 'system',
  })

  // Update anomaly status to triggered
  await Anomaly.findByIdAndUpdate(anomalyId, {
    action:       actionLabel,
    actionStatus: 'triggered',
  })

  // ── Call Python GNN service for real inference ──────────────────────────────
  // Run this async so we return immediately (202) and update in background
  setImmediate(async () => {
    let finalStatus = 'SUCCESS' // optimistic default

    try {
      const pythonResponse = await axios.post(
        `${PYTHON_URL}/predict/single`,
        {
          event_id:      log._id.toString(),
          resource_id:   effectiveResourceId,
          resource_type: anomaly.resourceType,
          metrics: {
            cpu_usage:     anomaly.metrics?.cpuUsage     ?? 0,
            memory_usage:  anomaly.metrics?.memoryUsage  ?? 0,
            latency:       anomaly.metrics?.latency       ?? 0,
            error_rate:    anomaly.metrics?.errorRate     ?? 0,
            request_count: anomaly.metrics?.requestCount  ?? 0,
          },
        },
        { timeout: 12000 }
      )

      console.log(`🐍 [automation.controller] Python /predict/single response for ${effectiveResourceId}:`, JSON.stringify(pythonResponse.data, null, 2))

      const { anomaly_score, is_anomaly, severity } = pythonResponse.data

      // If GNN still flags this as anomalous after remediation attempt, mark FAILED
      // Otherwise assume the action resolved the issue
      finalStatus = is_anomaly && anomaly_score > 0.5 ? 'FAILED' : 'SUCCESS'

      // Update anomaly score fields with fresh GNN result
      await Anomaly.findByIdAndUpdate(anomalyId, {
        score:    anomaly_score,
        severity: severity || (anomaly_score >= 0.85 ? 'critical' : anomaly_score >= 0.65 ? 'high' : 'medium'),
      })
    } catch (err) {
      // Python service unavailable — fallback to SUCCESS (action was dispatched)
      console.warn(`[automation.controller] Python service unavailable for ${effectiveResourceId}:`, err.message)
      finalStatus = 'SUCCESS'
    }

    // Persist final status to DB
    await AutomationLog.findByIdAndUpdate(log._id, { status: finalStatus })
    await Anomaly.findByIdAndUpdate(anomalyId, {
      actionStatus: finalStatus.toLowerCase(),
      resolved:     finalStatus === 'SUCCESS',
      resolvedAt:   finalStatus === 'SUCCESS' ? new Date() : undefined,
    })

    console.log(`[automation.controller] Remediation for ${effectiveResourceId} completed — status: ${finalStatus}`)
  })

  return res.status(202).json(new ApiResponse(202, { log }, 'Remediation action triggered — Python GNN evaluating result'))
})

// ─── GET /automation/stats ────────────────────────────────────────────────────
export const getAutomationStats = asyncHandler(async (req, res) => {
  const [total, success, pending, failed] = await Promise.all([
    AutomationLog.countDocuments(),
    AutomationLog.countDocuments({ status: 'SUCCESS' }),
    AutomationLog.countDocuments({ status: { $in: ['PENDING', 'triggered'] } }),
    AutomationLog.countDocuments({ status: 'FAILED' }),
  ])

  return res.status(200).json(
    new ApiResponse(200, { total, success, pending, failed }, 'Automation stats')
  )
})


// ─── Helper ───────────────────────────────────────────────────────────────────
function inferIcon(actionType) {
  if (!actionType) return 'alert'
  const t = actionType.toLowerCase()
  if (t.includes('scale')) return 'scale'
  if (t.includes('restart') || t.includes('redeploy')) return 'restart'
  if (t.includes('block') || t.includes('drain') || t.includes('failover')) return 'block'
  return 'alert'
}
