import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Anomaly from '../Models/anomaly.model.js'

// In-memory log (replace with DynamoDB or MongoDB collection in production)
const actions = []

// ─── GET /automation/logs ─────────────────────────────────────────────────────
export const getAutomationLogs = asyncHandler(async (req, res) => {
  const { limit = 50, status } = req.query
  let result = [...actions].reverse()
  if (status) result = result.filter((a) => a.status === status)
  return res.status(200).json(new ApiResponse(200, { logs: result.slice(0, parseInt(limit)) }, 'Automation logs fetched'))
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
    'scale-out': 'Scale out Auto Scaling Group',
    'restart-service': 'Restart ECS/Lambda service',
    'failover-db': 'Trigger RDS Multi-AZ failover',
    'drain-instance': 'Drain ELB target and deregister',
    'increase-memory': 'Increase Lambda memory allocation',
    'notify': 'Send PagerDuty / SNS notification',
  }

  if (!SUPPORTED_ACTIONS[actionType]) {
    throw new ApiError(400, `Unsupported actionType. Must be one of: ${Object.keys(SUPPORTED_ACTIONS).join(', ')}`)
  }

  const log = {
    id: `action-${Date.now()}`,
    anomalyId,
    actionType,
    actionLabel: SUPPORTED_ACTIONS[actionType],
    resourceId: resourceId || anomaly.resourceId,
    params,
    status: 'triggered',
    triggeredBy: req.user?.email || 'system',
    triggeredAt: new Date(),
  }

  actions.push(log)

  // Update anomaly action field
  await Anomaly.findByIdAndUpdate(anomalyId, {
    action: SUPPORTED_ACTIONS[actionType],
    actionStatus: 'triggered',
  })

  // Simulate async completion
  setTimeout(async () => {
    log.status = 'success'
    log.completedAt = new Date()
    await Anomaly.findByIdAndUpdate(anomalyId, { actionStatus: 'success' })
  }, 3000)

  return res.status(202).json(new ApiResponse(202, { log }, 'Remediation action triggered'))
})

// ─── GET /automation/stats ────────────────────────────────────────────────────
export const getAutomationStats = asyncHandler(async (req, res) => {
  const stats = {
    total: actions.length,
    success: actions.filter((a) => a.status === 'success').length,
    triggered: actions.filter((a) => a.status === 'triggered').length,
    failed: actions.filter((a) => a.status === 'failed').length,
  }
  return res.status(200).json(new ApiResponse(200, stats, 'Automation stats'))
})
