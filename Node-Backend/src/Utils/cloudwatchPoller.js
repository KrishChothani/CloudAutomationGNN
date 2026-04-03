/**
 * cloudwatchPoller.js
 * ───────────────────
 * Polls AWS CloudWatch every 60 seconds for real metrics from configured resources.
 * For each data point fetched:
 *   1. Saves a new Event document to MongoDB
 *   2. POSTs to Python GNN /predict to get an anomaly score
 *   3. If score > 0.3, creates an Anomaly document automatically
 *   4. If anomaly is CRITICAL (score > 0.85), creates an AutomationLog entry
 *
 * Configuration via environment variables:
 *   AWS_REGION            — e.g. "ap-south-1"
 *   AWS_EC2_INSTANCE_IDS  — comma-separated EC2 instance IDs
 *   AWS_LAMBDA_NAMES      — comma-separated Lambda function names
 *   AWS_RDS_INSTANCES     — comma-separated RDS DB instance identifiers
 *   PYTHON_SERVICE_URL    — Python GNN backend URL
 *   CLOUDWATCH_POLL_INTERVAL — ms between polls (default 60000)
 */

import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch'
import axios from 'axios'
import Event from '../Models/event.model.js'
import Anomaly from '../Models/anomaly.model.js'
import AutomationLog from '../Models/automationLog.model.js'

const PYTHON_URL     = process.env.PYTHON_SERVICE_URL        || 'http://localhost:8000'
const POLL_INTERVAL  = parseInt(process.env.CLOUDWATCH_POLL_INTERVAL || '60000')
const AWS_REGION     = process.env.AWS_REGION || 'ap-south-1'

// ─── CloudWatch client ───────────────────────────────────────────────────────
let cwClient = null
function getCWClient() {
  if (!cwClient) {
    cwClient = new CloudWatchClient({ region: AWS_REGION })
  }
  return cwClient
}

// ─── Fetch one metric from CloudWatch ────────────────────────────────────────
async function fetchMetric({ namespace, metricName, dimensions, stat = 'Average' }) {
  const now   = new Date()
  const start = new Date(now.getTime() - 5 * 60 * 1000) // last 5 minutes

  try {
    const cmd = new GetMetricStatisticsCommand({
      Namespace:  namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime:  start,
      EndTime:    now,
      Period:     300, // 5-minute granularity
      Statistics: [stat],
    })
    const response = await getCWClient().send(cmd)
    const datapoints = response.Datapoints || []
    if (datapoints.length === 0) return null
    // Return the most recent datapoint value
    const sorted = datapoints.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
    return sorted[0][stat] ?? null
  } catch (err) {
    // Silently skip — the resource might not exist yet or IAM perms may be missing
    console.warn(`[CW] Failed to fetch ${metricName} for ${JSON.stringify(dimensions)}: ${err.message}`)
    return null
  }
}

// ─── Process one resource ─────────────────────────────────────────────────────
async function processResource({ resourceId, resourceType, metrics }) {
  // Skip if all metrics are null (resource doesn't exist or no data)
  const hasData = Object.values(metrics).some(v => v !== null && v !== undefined)
  if (!hasData) return

  // 1. Save Event document
  const event = await Event.create({
    resourceId,
    resourceType,
    source: 'CloudWatch',
    metrics: {
      cpuUsage:     metrics.cpu     ?? undefined,
      memoryUsage:  metrics.memory  ?? undefined,
      latency:      metrics.latency ?? undefined,
      errorRate:    metrics.errorRate ?? undefined,
      requestCount: metrics.requestCount ?? undefined,
    },
  })

  // 2. Call Python GNN for anomaly score
  let score = 0
  try {
    const response = await axios.post(`${PYTHON_URL}/predict/single`, {
      event_id:      event._id.toString(),
      resource_id:   resourceId,
      resource_type: resourceType,
      metrics:       event.metrics,
    }, { timeout: 10000 })
    console.log('🐍 [cloudwatchPoller] Python API Response:', JSON.stringify(response.data, null, 2))
    score = response.data?.anomaly_score ?? response.data?.score ?? 0
  } catch (err) {
    console.warn(`[CW] Python GNN unavailable for ${resourceId}: ${err.message}`)
    // Fallback: estimate score from CPU (simple heuristic until GNN is available)
    if (metrics.cpu !== null) score = Math.min(1, (metrics.cpu / 100) * 0.8)
  }

  // Mark event as processed
  await Event.findByIdAndUpdate(event._id, { processed: true, processedAt: new Date() })

  // 3. If anomaly score > 0.3, create Anomaly document
  if (score > 0.3) {
    const severity =
      score >= 0.85 ? 'critical' :
      score >= 0.65 ? 'high'     :
      score >= 0.35 ? 'medium'   : 'low'

    const anomaly = await Anomaly.create({
      eventId:      event._id,
      resourceId,
      resourceType,
      score,
      severity,
      resolved:     false,
    })

    console.log(`[CW] 🚨 Anomaly detected: ${resourceId} — score=${score.toFixed(3)} severity=${severity}`)

    // 4. Auto-create automation log for CRITICAL anomalies
    if (score >= 0.85) {
      await AutomationLog.create({
        action:      `Auto-scaled ${resourceId}`,
        description: `CPU=${metrics.cpu?.toFixed(1) ?? 'N/A'}% exceeded threshold. Automatic remediation triggered.`,
        actionType:  'scale-out',
        anomalyId:   anomaly._id,
        resourceId,
        status:      'PENDING',
        triggeredBy: 'cloudwatch-poller',
      })
    }
  }
}

// ─── Poll all EC2 instances ───────────────────────────────────────────────────
async function pollEC2() {
  const ids = (process.env.AWS_EC2_INSTANCE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return

  for (const instanceId of ids) {
    const [cpu, memory] = await Promise.all([
      fetchMetric({
        namespace:  'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      }),
      fetchMetric({
        namespace:  'CWAgent',
        metricName: 'mem_used_percent',
        dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      }),
    ])

    await processResource({
      resourceId:   instanceId,
      resourceType: 'EC2',
      metrics:      { cpu, memory },
    })
  }
}

// ─── Poll all Lambda functions ────────────────────────────────────────────────
async function pollLambda() {
  const names = (process.env.AWS_LAMBDA_NAMES || '').split(',').map(s => s.trim()).filter(Boolean)
  if (names.length === 0) return

  for (const fnName of names) {
    const [latency, errors, requestCount] = await Promise.all([
      fetchMetric({
        namespace:  'AWS/Lambda',
        metricName: 'Duration',
        dimensions: [{ Name: 'FunctionName', Value: fnName }],
      }),
      fetchMetric({
        namespace:  'AWS/Lambda',
        metricName: 'Errors',
        dimensions: [{ Name: 'FunctionName', Value: fnName }],
        stat: 'Sum',
      }),
      fetchMetric({
        namespace:  'AWS/Lambda',
        metricName: 'Invocations',
        dimensions: [{ Name: 'FunctionName', Value: fnName }],
        stat: 'Sum',
      }),
    ])

    await processResource({
      resourceId:   fnName,
      resourceType: 'Lambda',
      metrics:      { latency, errorRate: errors, requestCount },
    })
  }
}

// ─── Poll all RDS instances ───────────────────────────────────────────────────
async function pollRDS() {
  const ids = (process.env.AWS_RDS_INSTANCES || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return

  for (const dbId of ids) {
    const [cpu, latency] = await Promise.all([
      fetchMetric({
        namespace:  'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbId }],
      }),
      fetchMetric({
        namespace:  'AWS/RDS',
        metricName: 'ReadLatency',
        dimensions: [{ Name: 'DBInstanceIdentifier', Value: dbId }],
      }),
    ])

    await processResource({
      resourceId:   dbId,
      resourceType: 'RDS',
      metrics:      { cpu, latency: latency ? latency * 1000 : null }, // convert s → ms
    })
  }
}

// ─── Main poll loop ───────────────────────────────────────────────────────────
async function poll() {
  console.log(`[CW] 🔄 Polling CloudWatch metrics — ${new Date().toISOString()}`)
  try {
    await Promise.allSettled([pollEC2(), pollLambda(), pollRDS()])
  } catch (err) {
    console.error('[CW] Poll error:', err.message)
  }
}

let pollerHandle = null

export function startPoller() {
  if (pollerHandle) return // already running

  // Guard: only run if at least one resource ID is configured
  const hasResources =
    process.env.AWS_EC2_INSTANCE_IDS ||
    process.env.AWS_LAMBDA_NAMES     ||
    process.env.AWS_RDS_INSTANCES

  if (!hasResources) {
    console.warn('[CW] ⚠️  No AWS resource IDs configured — CloudWatch poller is disabled.')
    console.warn('     Set AWS_EC2_INSTANCE_IDS, AWS_LAMBDA_NAMES, or AWS_RDS_INSTANCES in .env')
    return
  }

  console.log(`[CW] 🚀 Starting CloudWatch poller (interval: ${POLL_INTERVAL / 1000}s)`)
  // Run immediately on start, then every POLL_INTERVAL ms
  poll()
  pollerHandle = setInterval(poll, POLL_INTERVAL)
}

export function stopPoller() {
  if (pollerHandle) {
    clearInterval(pollerHandle)
    pollerHandle = null
    console.log('[CW] Poller stopped.')
  }
}
