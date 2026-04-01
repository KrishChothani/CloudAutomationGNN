/**
 * src/eventProcessor.js
 * ─────────────────────
 * Lambda handler for EventBridge / SQS cloud-metric events.
 * Triggered by the "cloud-metrics-rule" EventBridge rule
 * and the SQS event queue.
 *
 * Responsibilities:
 *   1. Parse the incoming event (EventBridge detail or SQS body)
 *   2. Normalize to a standard CloudMetricEvent shape
 *   3. Forward to the Python GNN inference service
 *   4. Persist anomalies to DynamoDB
 *   5. Publish critical anomaly alerts to SNS
 *   6. Return SQS batch-item-failure report for failed records
 */

import axios from 'axios'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { SNSClient, PublishCommand }       from '@aws-sdk/client-sns'
import { randomUUID }                      from 'crypto'

const PYTHON_URL      = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
const DYNAMODB_TABLE  = process.env.DYNAMODB_TABLE     || 'cloud-automation-gnn-dev'
const SNS_TOPIC_ARN   = process.env.SNS_TOPIC_ARN      || ''
const AWS_REGION      = process.env.AWS_REGION_NAME    || 'ap-south-1'

const ddbClient = new DynamoDBClient({ region: AWS_REGION })
const snsClient = new SNSClient({ region: AWS_REGION })

// ─── Severity thresholds ───────────────────────────────────────────────────────
const SEVERITY_THRESHOLDS = {
  critical: 0.85,
  high:     0.65,
  medium:   0.35,
}

function scoreToSeverity(score) {
  if (score >= SEVERITY_THRESHOLDS.critical) return 'critical'
  if (score >= SEVERITY_THRESHOLDS.high)     return 'high'
  if (score >= SEVERITY_THRESHOLDS.medium)   return 'medium'
  return 'low'
}

// ─── Normalize event payload ──────────────────────────────────────────────────
function parseEventRecord(record) {
  // SQS record
  if (record.body) {
    try {
      const parsed = JSON.parse(record.body)
      // EventBridge wrapped in SQS
      if (parsed.detail) return parsed.detail
      return parsed
    } catch (_) {
      console.warn('Failed to JSON-parse SQS body:', record.body)
      return null
    }
  }

  // Direct EventBridge invocation
  if (record.detail) return record.detail

  return record
}

// ─── Forward to Python GNN service ───────────────────────────────────────────
async function runGnnInference(resourceId, resourceType, metrics) {
  try {
    const response = await axios.post(
      `${PYTHON_URL}/predict/single`,
      {
        event_id:      randomUUID(),
        resource_id:   resourceId,
        resource_type: resourceType,
        metrics,
      },
      { timeout: 10_000 }
    )
    return response.data
  } catch (err) {
    console.error(`GNN inference failed for ${resourceId}:`, err.message)
    return null
  }
}

// ─── Save anomaly to DynamoDB ─────────────────────────────────────────────────
async function persistAnomaly(resourceId, resourceType, prediction) {
  try {
    const anomalyId = randomUUID()
    const severity  = scoreToSeverity(prediction.anomaly_score)
    const expiresAt = Math.floor(Date.now() / 1000) + 86_400 * 7  // TTL: 7 days

    await ddbClient.send(new PutItemCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        anomalyId:    { S: anomalyId },
        resourceId:   { S: resourceId },
        resourceType: { S: resourceType },
        anomalyScore: { N: String(prediction.anomaly_score) },
        isAnomaly:    { BOOL: prediction.is_anomaly },
        severity:     { S: severity },
        timestamp:    { S: new Date().toISOString() },
        expiresAt:    { N: String(expiresAt) },
        resolved:     { BOOL: false },
      },
    }))

    return anomalyId
  } catch (err) {
    console.error('DynamoDB persist failed:', err.message)
    return null
  }
}

// ─── Publish critical anomaly to SNS ─────────────────────────────────────────
async function notifySNS(resourceId, anomalyScore, severity) {
  if (!SNS_TOPIC_ARN) return

  try {
    const message = JSON.stringify({
      service:     'CloudAutomationGNN',
      event:       'AnomalyDetected',
      resourceId,
      anomalyScore,
      severity,
      timestamp:   new Date().toISOString(),
      message:     `[${severity.toUpperCase()}] Anomaly detected on ${resourceId} (score: ${(anomalyScore * 100).toFixed(1)}%)`,
    })

    await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message:  message,
      Subject:  `[${severity.toUpperCase()}] Cloud Anomaly — ${resourceId}`,
      MessageAttributes: {
        severity: { DataType: 'String', StringValue: severity },
      },
    }))

    console.log(`📢 SNS notification sent for ${resourceId} (${severity})`)
  } catch (err) {
    console.error('SNS publish failed:', err.message)
  }
}

// ─── Process a single cloud metric event ─────────────────────────────────────
async function processMetricEvent(payload) {
  const {
    resourceId   = payload.resource_id,
    resourceType = payload.resource_type || 'EC2',
    metrics      = payload.metrics || {},
  } = payload

  if (!resourceId) {
    console.warn('Skipping event — missing resourceId:', payload)
    return
  }

  console.log(`Processing metric event for ${resourceId} (${resourceType})`)

  // 1. GNN inference
  const prediction = await runGnnInference(resourceId, resourceType, metrics)
  if (!prediction) return

  // 2. Persist if anomaly detected
  if (prediction.is_anomaly) {
    const anomalyId = await persistAnomaly(resourceId, resourceType, prediction)

    // 3. Notify via SNS for critical/high severity
    const severity = scoreToSeverity(prediction.anomaly_score)
    if (['critical', 'high'].includes(severity)) {
      await notifySNS(resourceId, prediction.anomaly_score, severity)
    }

    console.log(`🔴 Anomaly persisted: ${anomalyId} — ${resourceId} score=${prediction.anomaly_score}`)
  } else {
    console.log(`🟢 Normal: ${resourceId} score=${prediction.anomaly_score}`)
  }
}

// ─── Main Lambda handler ──────────────────────────────────────────────────────
export const handler = async (event) => {
  console.log('eventProcessor triggered:', JSON.stringify({ source: event.source, type: event['detail-type'] || 'SQS' }))

  // ── SQS batch mode ────────────────────────────────────────────────────────
  if (event.Records) {
    const batchItemFailures = []

    await Promise.allSettled(
      event.Records.map(async (record) => {
        const payload = parseEventRecord(record)
        if (!payload) {
          batchItemFailures.push({ itemIdentifier: record.messageId })
          return
        }
        try {
          await processMetricEvent(payload)
        } catch (err) {
          console.error(`Failed to process record ${record.messageId}:`, err)
          batchItemFailures.push({ itemIdentifier: record.messageId })
        }
      })
    )

    // ReportBatchItemFailures — only failed records are retried
    return { batchItemFailures }
  }

  // ── EventBridge direct invocation ────────────────────────────────────────
  const payload = parseEventRecord(event)
  if (payload) {
    await processMetricEvent(payload)
  }

  return { statusCode: 200, body: 'Event processed' }
}
