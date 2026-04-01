import mongoose from 'mongoose'
import { DB_NAME } from '../Constants.js'

let isConnected = false

const connectDB = async () => {
  if (isConnected) return

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set')
  }

  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    )

    isConnected = true
    console.log(`\n✅ MongoDB connected: ${connectionInstance.connection.host}`)
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

export default connectDB
