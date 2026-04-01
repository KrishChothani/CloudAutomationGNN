import { asyncHandler } from '../Utils/AsyncHandler.js'
import { ApiError } from '../Utils/ApiError.js'
import { ApiResponse } from '../Utils/ApiResponse.js'
import Anomaly from '../Models/anomaly.model.js'
import axios from 'axios'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

// ─── GET /anomalies ───────────────────────────────────────────────────────────
export const getAnomalies = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    severity,
    resolved,
    resourceId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query

  const filter = {}
  if (severity) filter.severity = severity
  if (resolved !== undefined) filter.resolved = resolved === 'true'
  if (resourceId) filter.resourceId = resourceId

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const sortDir = sortOrder === 'asc' ? 1 : -1

  const [anomalies, total] = await Promise.all([
    Anomaly.find(filter)
      .populate('eventId', 'resourceId resourceType metrics createdAt')
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Anomaly.countDocuments(filter),
  ])

  return res.status(200).json(
    new ApiResponse(200, {
      anomalies,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    }, 'Anomalies fetched')
  )
})

// ─── GET /anomalies/:id ───────────────────────────────────────────────────────
export const getAnomalyById = asyncHandler(async (req, res) => {
  const anomaly = await Anomaly.findById(req.params.id)
    .populate('eventId')
    .lean()
  if (!anomaly) throw new ApiError(404, 'Anomaly not found')
  return res.status(200).json(new ApiResponse(200, { anomaly }, 'Anomaly fetched'))
})

// ─── GET /anomalies/explain/:id ───────────────────────────────────────────────
export const getExplanation = asyncHandler(async (req, res) => {
  const anomaly = await Anomaly.findById(req.params.id).lean()
  if (!anomaly) throw new ApiError(404, 'Anomaly not found')

  // If explanation already cached, return it
  if (anomaly.explanation && anomaly.shapValues) {
    return res.status(200).json(new ApiResponse(200, {
      anomalyId: anomaly._id,
      explanation: anomaly.explanation,
      shapValues: anomaly.shapValues,
      affectedNodes: anomaly.affectedNodes,
    }, 'Explanation from cache'))
  }

  // Otherwise call Python XAI service
  try {
    const response = await axios.post(`${PYTHON_URL}/explain`, {
      anomalyId: anomaly._id.toString(),
      resourceId: anomaly.resourceId,
      score: anomaly.score,
    }, { timeout: 15000 })

    const { explanation, shapValues, affectedNodes } = response.data

    // Cache back to DB
    await Anomaly.findByIdAndUpdate(anomaly._id, { explanation, shapValues, affectedNodes })

    return res.status(200).json(new ApiResponse(200, {
      anomalyId: anomaly._id,
      explanation,
      shapValues,
      affectedNodes,
    }, 'Explanation generated'))
  } catch (err) {
    console.error('Python XAI service error:', err.message)
    throw new ApiError(502, 'XAI service unavailable')
  }
})

// ─── GET /anomalies/stats ─────────────────────────────────────────────────────
export const getAnomalyStats = asyncHandler(async (req, res) => {
  const stats = await Anomaly.aggregate([
    {
      $group: {
        _id: '$severity',
        count: { $sum: 1 },
        resolved: { $sum: { $cond: ['$resolved', 1, 0] } },
        avgScore: { $avg: '$score' },
      },
    },
    { $sort: { _id: 1 } },
  ])
  const total = await Anomaly.countDocuments()
  const active = await Anomaly.countDocuments({ resolved: false })

  return res.status(200).json(new ApiResponse(200, { total, active, bySeverity: stats }, 'Anomaly stats'))
})

// ─── PATCH /anomalies/:id/resolve ─────────────────────────────────────────────
export const resolveAnomaly = asyncHandler(async (req, res) => {
  const anomaly = await Anomaly.findByIdAndUpdate(
    req.params.id,
    { resolved: true, resolvedAt: new Date() },
    { new: true }
  )
  if (!anomaly) throw new ApiError(404, 'Anomaly not found')
  return res.status(200).json(new ApiResponse(200, { anomaly }, 'Anomaly resolved'))
})
