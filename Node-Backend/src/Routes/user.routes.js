import { Router } from 'express'
import { verifyJWT } from '../Middlewares/auth.middleware.js'
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
} from '../Controllers/user.controller.js'

const router = Router()

// Public
router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/refresh-token', refreshAccessToken)

// Protected
router.post('/logout', verifyJWT, logoutUser)
router.get('/me', verifyJWT, getCurrentUser)

export default router
