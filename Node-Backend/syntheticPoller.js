/**
 * syntheticPoller.js
 * ──────────────────
 * Simulates a continuous stream of real-time cloud metrics.
 * Runs independently and writes directly to MongoDB and the Python GNN.
 * Great for local testing and displaying the UI without an active AWS account.
 */

import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import axios from 'axios'
import connectDB from './src/db/index.js'
import Event from './src/Models/event.model.js'
import Anomaly from './src/Models/anomaly.model.js'
import AutomationLog from './src/Models/automationLog.model.js'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

// The simulated resources in our "cloud environment"
const RESOURCES = [
  { id: 'ec2-web-1',   type: 'EC2',    baseCpu: 30, baseMem: 40, baseLat: 40 },
  { id: 'ec2-web-2',   type: 'EC2',    baseCpu: 35, baseMem: 45, baseLat: 45 },
  { id: 'lambda-auth', type: 'Lambda', baseCpu: 15, baseMem: 20, baseLat: 200 },
  { id: 'rds-primary', type: 'RDS',    baseCpu: 40, baseMem: 60, baseLat: 15 },
  { id: 'rds-replica', type: 'RDS',    baseCpu: 10, baseMem: 30, baseLat: 10 },
  { id: 's3-assets',   type: 'S3',     baseCpu: 5,  baseMem: 5,  baseLat: 50 }
]

// To make testing fun, we occasionally spike a random resource
let currentAnomalyTarget = null
let anomalyCyclesLeft = 0

// Adds a small random jitter to a base number
function jitter(base) {
  const variation = base * 0.15 // +/- 15%
  return Math.max(0, base + (Math.random() * variation * 2 - variation))
}

async function simulateTick() {
  console.log(`\n[Sim] ⏱  Tick: Generating real-time data... (${new Date().toLocaleTimeString()})`)

  // Decide randomly to start an anomaly
  if (!currentAnomalyTarget && Math.random() < 0.1) {
    currentAnomalyTarget = RESOURCES[Math.floor(Math.random() * RESOURCES.length)]
    anomalyCyclesLeft = 4 // Stays anomalous for 4 ticks (20s)
    console.log(`\n[Sim] 🔥 SPOILER: Breaking ${currentAnomalyTarget.id} intentionally...`)
  }

  for (const r of RESOURCES) {
    const isAnomalous = currentAnomalyTarget && currentAnomalyTarget.id === r.id
    
    // Generate metrics
    const metrics = {
      cpuUsage: isAnomalous ? Math.min(100, r.baseCpu * 3) : jitter(r.baseCpu),
      memoryUsage: isAnomalous ? Math.min(100, r.baseMem * 2) : jitter(r.baseMem),
      latency: isAnomalous ? r.baseLat * 5 : jitter(r.baseLat),
      requestCount: jitter(r.type === 'Lambda' ? 50 : 200)
    }

    // 1. Save Event directly bypassing HTTP Auth
    const event = await Event.create({
      resourceId: r.id,
      resourceType: r.type,
      source: 'Synthetic',
      metrics,
      processed: false
    })

    // 2. Try the real Python Service, fallback to simple math if it's down
    let score = 0
    let explanation = ''
    try {
      const response = await axios.post(`${PYTHON_URL}/predict`, {
        eventId: event._id.toString(),
        resourceId: r.id,
        resourceType: r.type,
        metrics: event.metrics
      }, { timeout: 3000 })
      
      score = response.data?.score ?? response.data?.anomalyScore ?? 0
    } catch (err) {
      // Python down? Just use a manual rule based on the fake data we generated
      score = isAnomalous ? 0.92 : (Math.random() * 0.2)
      explanation = 'Simulated Anomaly. Python backend unreachable.'
    }

    // Mark event processed
    await Event.findByIdAndUpdate(event._id, { processed: true, processedAt: new Date() })

    // 3. Create anomalies and automations for high scores (mimicking cloudwatchPoller.js)
    if (score > 0.3) {
      const severity = score >= 0.85 ? 'critical' : score >= 0.65 ? 'high' : 'medium'
      
      const anomaly = await Anomaly.create({
        eventId: event._id,
        resourceId: r.id,
        resourceType: r.type,
        score,
        severity,
        explanation: isAnomalous ? `Massive metric spike simulated on ${r.id}.` : explanation,
        resolved: false,
      })

      console.log(`[Sim] 🚨 ANOMALY: ${r.id} (Score: ${(score*100).toFixed(0)}%)`)

      if (score >= 0.85) {
        await AutomationLog.create({
          action: `Auto-remediated ${r.id}`,
          description: `Synthetic system detected critical spike. Triggered mitigation plan.`,
          actionType: r.type === 'EC2' ? 'scale-out' : 'restart-service',
          anomalyId: anomaly._id,
          resourceId: r.id,
          status: 'SUCCESS',
          triggeredBy: 'synthetic-poller'
        })
      }
    }
  }

  if (anomalyCyclesLeft > 0) {
    anomalyCyclesLeft--
    if (anomalyCyclesLeft === 0) {
      console.log(`[Sim] 🧯 Fixing ${currentAnomalyTarget.id} back to normal.\n`)
      currentAnomalyTarget = null
    }
  }
}

async function start() {
  await connectDB()
  
  // Wipe out the database to start fresh!
  console.log('[Sim] 🧹 Wiping old DB records to ensure a clean dashboard...')
  await Event.deleteMany({})
  await Anomaly.deleteMany({})
  await AutomationLog.deleteMany({})
  
  console.log('[Sim] 🚀 DB Clean. Sending real-time streams every 5 seconds...')
  
  // Send the first batch immediately so the dashboard populates fast
  await simulateTick()

  // Continue streaming every 5 seconds
  setInterval(simulateTick, 5000)
}

start()
