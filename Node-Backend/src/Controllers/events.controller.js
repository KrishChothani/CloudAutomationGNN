import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Event from '../Models/event.model.js'
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
    await axios.post(`${PYTHON_URL}/predict`, {
      eventId: event._id.toString(),
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      metrics: event.metrics,
    }, { timeout: 10000 })
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
export const getEventStats = asyncHandler(async (req, res) => {
  const stats = await Event.aggregate([
    {
      $group: {
        _id: '$resourceType',
        count: { $sum: 1 },
        processedCount: { $sum: { $cond: ['$processed', 1, 0] } },
        avgCpu: { $avg: '$metrics.cpuUsage' },
        avgMemory: { $avg: '$metrics.memoryUsage' },
      },
    },
    { $sort: { count: -1 } },
  ])

  const total = await Event.countDocuments()

  return res.status(200).json(new ApiResponse(200, { total, byType: stats }, 'Event stats fetched'))
})
