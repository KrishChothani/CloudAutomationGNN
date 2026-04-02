import { Router } from 'express'
import { verifyJWT } from '../Middlewares/auth.middleware.js'
import {
  getAnomalies,
  getAnomalyById,
  getExplanation,
  getAnomalyStats,
  resolveAnomaly,
} from '../Controllers/anomaly.controller.js'

const router = Router()

router.use(verifyJWT)

// Static routes first — must precede /:id
router.get('/stats', getAnomalyStats)
router.get('/', getAnomalies)

// /:id/explain — FIXED: was /explain/:id which conflicted with /:id
router.get('/:id/explain', getExplanation)

// /:id
router.get('/:id', getAnomalyById)
router.patch('/:id/resolve', resolveAnomaly)

export default router
