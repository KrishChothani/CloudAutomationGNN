import { Router } from 'express'
import { verifyJWT } from '../Middlewares/auth.middleware.js'
import { getGraph } from '../Controllers/graph.controller.js'

const router = Router()

router.use(verifyJWT)

// GET /api/v1/graph — full node/edge topology
router.get('/', getGraph)

export default router
