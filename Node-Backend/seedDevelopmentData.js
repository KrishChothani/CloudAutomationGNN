import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import connectDB from './src/db/index.js'
import Event from './src/Models/event.model.js'
import Anomaly from './src/Models/anomaly.model.js'
import AutomationLog from './src/Models/automationLog.model.js'

async function seed() {
  await connectDB()

  console.log('🌱 Trimming old data...')
  await Event.deleteMany({})
  await Anomaly.deleteMany({})
  await AutomationLog.deleteMany({})

  console.log('📊 Injecting events...')
  
  const resources = [
    { id: 'ec2-prod-1', type: 'EC2' },
    { id: 'lambda-api', type: 'Lambda' },
    { id: 'rds-main', type: 'RDS' }
  ]

  let anomalyEvent = null

  for (const r of resources) {
    for (let i = 20; i >= 0; i--) {
      // time going backwards from now
      const time = new Date(Date.now() - i * 5000)

      // random metrics
      let cpu = Math.random() * 30 + 10 // 10-40
      let mem = Math.random() * 30 + 20 // 20-50
      let lat = Math.random() * 20 + 10 // 10-30

      // Spike at the end for rds-main
      if (r.id === 'rds-main' && i < 2) {
        cpu = 95
        lat = 350
      }

      const event = await Event.create({
        resourceId: r.id,
        resourceType: r.type,
        metrics: {
          cpuUsage: cpu,
          memoryUsage: mem,
          latency: lat,
          requestCount: Math.floor(Math.random() * 500)
        },
        createdAt: time,
        processed: true
      })

      if (r.id === 'rds-main' && i === 0) {
        anomalyEvent = event
      }
    }
  }

  console.log('🚨 Injecting anomaly...')
  const anomaly = await Anomaly.create({
    eventId: anomalyEvent._id,
    resourceId: 'rds-main',
    resourceType: 'RDS',
    score: 0.89,
    severity: 'critical',
    explanation: 'High CPU utilization and extreme latency spike detected on RDS primary instance.',
    shapValues: {
      cpuUsage: 0.72,
      latency: 0.55,
      requestCount: -0.1
    },
    affectedNodes: [
      { nodeId: 'lambda-api' }
    ],
    createdAt: new Date(),
    resolved: false,
    actionStatus: 'pending' // will be overwritten by automation log below
  })

  console.log('🤖 Injecting automation log...')
  await AutomationLog.create({
    action: 'Auto-scaled rds-main',
    description: 'CPU=95% exceeded threshold. Multi-AZ failover and scaling triggered.',
    actionType: 'failover-db',
    anomalyId: anomaly._id,
    resourceId: 'rds-main',
    status: 'SUCCESS',
    triggeredBy: 'cloudwatch-poller'
  })

  // update anomaly to reflect the success
  await Anomaly.findByIdAndUpdate(anomaly._id, { actionStatus: 'success', action: 'Auto-scaled rds-main' })

  console.log('\n✅ Seed complete! Go look at your dashboard now.')
  process.exit(0)
}

seed()
