import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'

// Route imports
import userRoutes from './Routes/user.routes.js'
import eventsRoutes from './Routes/events.routes.js'
import anomalyRoutes from './Routes/anomaly.routes.js'
import { ApiError } from './Utils/ApiError.js'
import { ApiResponse } from './Utils/ApiResponse.js'

// ─── Create Express app ───────────────────────────────────────────────────────
const app = express()

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: "http://cloud-automation-gnn-frontend-dev.s3-website.ap-south-1.amazonaws.com",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))


app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))
app.use(cookieParser())

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json(new ApiResponse(200, {
    status: 'OK',
    service: 'CloudAutomationGNN Node Backend',
    timestamp: new Date().toISOString(),
  }, 'Service is healthy'))
})


// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/events', eventsRoutes)
app.use('/api/v1/anomalies', anomalyRoutes)

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json(new ApiResponse(404, null, `Route ${req.method} ${req.path} not found`))
})

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${statusCode}: ${message}`, err.stack)
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
  })
})

export default app
