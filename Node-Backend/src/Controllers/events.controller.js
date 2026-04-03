import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Event from '../Models/event.model.js'
import Anomaly from '../Models/anomaly.model.js'
import AutomationLog from '../Models/automationLog.model.js'
import axios from 'axios'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

// ─── GET /events ─────────────────────────────────────────────────────────────
export const getEvents = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    resourceId,
    resourceType,
    processed,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query

  const filter = {}
  if (resourceId) filter.resourceId = resourceId
  if (resourceType) filter.resourceType = resourceType
  if (processed !== undefined) filter.processed = processed === 'true'

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const sortDir = sortOrder === 'asc' ? 1 : -1

  const [events, total] = await Promise.all([
    Event.find(filter)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Event.countDocuments(filter),
  ])

  return res.status(200).json(
    new ApiResponse(200, {
      events,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    }, 'Events fetched successfully')
  )
})

// ─── GET /events/:id ─────────────────────────────────────────────────────────
export const getEventById = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).lean()
  if (!event) throw new ApiError(404, 'Event not found')
  return res.status(200).json(new ApiResponse(200, { event }, 'Event fetched'))
})

// ─── POST /events ─────────────────────────────────────────────────────────────
export const createEvent = asyncHandler(async (req, res) => {
  const { resourceId, resourceType, region, metrics, source, rawPayload } = req.body

  if (!resourceId || !resourceType) {
    throw new ApiError(400, 'resourceId and resourceType are required')
  }

  const event = await Event.create({ resourceId, resourceType, region, metrics, source, rawPayload })

  // Asynchronously forward to Python GNN service
  try {
    const response = await axios.post(`${PYTHON_URL}/predict/single`, {
      event_id:     event._id.toString(),
      resource_id:  event.resourceId,
      resource_type: event.resourceType,
      metrics:      event.metrics,
    }, { timeout: 10000 })
    console.log('🐍 [events.controller] Python API Response:', JSON.stringify(response.data, null, 2))
  } catch (err) {
    console.warn('⚠️  Python GNN service unavailable:', err.message)
  }

  return res.status(201).json(new ApiResponse(201, { event }, 'Event ingested successfully'))
})

// ─── POST /events/batch ───────────────────────────────────────────────────────
export const batchCreateEvents = asyncHandler(async (req, res) => {
  const { events } = req.body
  if (!Array.isArray(events) || events.length === 0) {
    throw new ApiError(400, 'events must be a non-empty array')
  }

  const created = await Event.insertMany(events, { ordered: false })

  return res.status(201).json(new ApiResponse(201, { count: created.length }, `${created.length} events ingested`))
})

// ─── GET /events/stats ────────────────────────────────────────────────────────
// Returns the shape the Dashboard stat cards need:
// { totalResources, activeAnomalies, automationsToday, avgAnomalyScore }
export const getEventStats = asyncHandler(async (req, res) => {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    totalResources,
    activeAnomalies,
    automationsToday,
    avgScoreResult,
  ] = await Promise.all([
    // Count distinct resourceIds in Event collection
    Event.distinct('resourceId').then(ids => ids.length),

    // Active (unresolved) anomalies
    Anomaly.countDocuments({ resolved: false }),

    // Automation actions triggered today
    AutomationLog.countDocuments({ createdAt: { $gte: todayStart } }),

    // Average anomaly score across unresolved anomalies
    Anomaly.aggregate([
      { $match: { resolved: false } },
      { $group: { _id: null, avg: { $avg: '$score' } } },
    ]),
  ])

  const avgAnomalyScore = avgScoreResult[0]?.avg ?? 0

  return res.status(200).json(
    new ApiResponse(200, {
      totalResources,
      activeAnomalies,
      automationsToday,
      avgAnomalyScore: Math.round(avgAnomalyScore * 100) / 100,
    }, 'Dashboard stats fetched')
  )
})

// ─── GET /events/:resourceId/metrics ─────────────────────────────────────────
// Returns time-series arrays for MetricsChart
// Response: { timestamps: [], cpu: [], memory: [], latency: [], errorRate: [] }
export const getResourceMetrics = asyncHandler(async (req, res) => {
  const { resourceId } = req.params
  const { limit = 20 } = req.query

  const events = await Event.find({ resourceId })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .select('metrics createdAt')
    .lean()

  // Reverse so oldest→newest (chart flows left→right)
  events.reverse()

  const timestamps = events.map(e =>
    new Date(e.createdAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  )
  const cpu      = events.map(e => e.metrics?.cpuUsage    ?? null)
  const memory   = events.map(e => e.metrics?.memoryUsage ?? null)
  const latency  = events.map(e => e.metrics?.latency     ?? null)
  const errorRate = events.map(e => e.metrics?.errorRate  ?? null)

  return res.status(200).json(
    new ApiResponse(200, {
      resourceId,
      timestamps,
      cpu,
      memory,
      latency,
      errorRate,
      count: events.length,
    }, `Metrics for ${resourceId}`)
  )
})
