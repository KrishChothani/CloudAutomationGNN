import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema(
  {
    resourceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      enum: ['EC2', 'RDS', 'Lambda', 'S3', 'ELB', 'ECS', 'EKS', 'DynamoDB', 'SQS', 'SNS', 'CloudFront', 'Other'],
    },
    region: {
      type: String,
      default: 'ap-south-1',
    },
    metrics: {
      cpuUsage: { type: Number, min: 0, max: 100 },
      memoryUsage: { type: Number, min: 0, max: 100 },
      diskUsage: { type: Number, min: 0, max: 100 },
      networkIn: { type: Number }, // bytes/sec
      networkOut: { type: Number }, // bytes/sec
      latency: { type: Number }, // ms
      errorRate: { type: Number, min: 0, max: 100 },
      requestCount: { type: Number },
    },
    source: {
      type: String,
      enum: ['CloudWatch', 'Lambda', 'Manual', 'Synthetic', 'EventBridge'],
      default: 'CloudWatch',
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
    },
    processed: {
      type: Boolean,
      default: false,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
)

// Compound index for efficient queries
eventSchema.index({ resourceId: 1, createdAt: -1 })
eventSchema.index({ resourceType: 1, createdAt: -1 })

const Event = mongoose.model('Event', eventSchema)

export default Event
