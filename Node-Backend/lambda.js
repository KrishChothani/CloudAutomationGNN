import dotenv from 'dotenv'
dotenv.config()

import serverless from 'serverless-http'
import connectDB from './src/db/index.js'
import app from './src/app.js'

// Ensure DB is connected before handling requests (Lambda warm-start caching)
let isConnected = false

const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false

  if (!isConnected) {
    await connectDB()
    isConnected = true
  }

  // Handle EventBridge / SQS triggered events (not HTTP)
  if (event.source === 'aws.events' || event.Records) {
    console.log('Processing EventBridge/SQS event:', JSON.stringify(event, null, 2))
    // Parse cloud metric events from SQS
    if (event.Records) {
      for (const record of event.Records) {
        try {
          const body = JSON.parse(record.body)
          console.log('Processing SQS message:', body)
          // Forward to events controller logic here
        } catch (err) {
          console.error('Failed to parse SQS record:', err)
        }
      }
    }
    return { statusCode: 200, body: 'Event processed' }
  }

  // Handle HTTP requests via API Gateway
  const serverlessHandler = serverless(app)
  return serverlessHandler(event, context)
}

export { handler }
