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

router.get('/stats', getAnomalyStats)
router.get('/', getAnomalies)
router.get('/explain/:id', getExplanation)
router.get('/:id', getAnomalyById)
router.patch('/:id/resolve', resolveAnomaly)

export default router
