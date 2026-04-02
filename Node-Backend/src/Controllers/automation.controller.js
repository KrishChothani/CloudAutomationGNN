import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Anomaly from '../Models/anomaly.model.js'
import AutomationLog from '../Models/automationLog.model.js'

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

  // Update anomaly status
  await Anomaly.findByIdAndUpdate(anomalyId, {
    action:       actionLabel,
    actionStatus: 'triggered',
  })

  // Simulate async completion — update log to SUCCESS/FAILED
  setTimeout(async () => {
    const finalStatus = Math.random() > 0.1 ? 'SUCCESS' : 'FAILED'
    await AutomationLog.findByIdAndUpdate(log._id, { status: finalStatus })
    await Anomaly.findByIdAndUpdate(anomalyId, {
      actionStatus: finalStatus.toLowerCase(),
    })
  }, 3000)

  return res.status(202).json(new ApiResponse(202, { log }, 'Remediation action triggered'))
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
