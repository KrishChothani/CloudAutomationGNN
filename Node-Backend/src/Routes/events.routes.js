import { Router } from 'express'
import { verifyJWT } from '../Middlewares/auth.middleware.js'
import {
  getEvents,
  getEventById,
  createEvent,
  batchCreateEvents,
  getEventStats,
} from '../Controllers/events.controller.js'

const router = Router()

// All events routes require JWT
router.use(verifyJWT)

router.get('/stats', getEventStats)
router.get('/', getEvents)
router.get('/:id', getEventById)
router.post('/', createEvent)
router.post('/batch', batchCreateEvents)

export default router
