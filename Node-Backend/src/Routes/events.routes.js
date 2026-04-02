import { Router } from 'express'
import { verifyJWT } from '../Middlewares/auth.middleware.js'
import {
  getEvents,
  getEventById,
  createEvent,
  batchCreateEvents,
  getEventStats,
  getResourceMetrics,
} from '../Controllers/events.controller.js'

const router = Router()

// All events routes require JWT
router.use(verifyJWT)

// Static routes first (must come before /:id)
router.get('/stats', getEventStats)
router.post('/batch', batchCreateEvents)

// /:resourceId/metrics — time-series for MetricsChart
router.get('/:resourceId/metrics', getResourceMetrics)

// Base CRUD
router.get('/', getEvents)
router.get('/:id', getEventById)
router.post('/', createEvent)

export default router
