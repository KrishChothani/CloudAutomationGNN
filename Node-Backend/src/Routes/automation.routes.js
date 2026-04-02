import { Router } from 'express'
import { verifyJWT } from '../Middlewares/auth.middleware.js'
import {
  getAutomationLogs,
  createAutomationLog,
  triggerRemediation,
  getAutomationStats,
} from '../Controllers/automation.controller.js'

const router = Router()

router.use(verifyJWT)

// GET  /api/v1/automation/logs   — timeline for AutomationLog.jsx
// POST /api/v1/automation/logs   — create a new log entry
router.get('/logs', getAutomationLogs)
router.post('/logs', createAutomationLog)

// POST /api/v1/automation/trigger — fire a remediation action
router.post('/trigger', triggerRemediation)

// GET  /api/v1/automation/stats
router.get('/stats', getAutomationStats)

export default router
