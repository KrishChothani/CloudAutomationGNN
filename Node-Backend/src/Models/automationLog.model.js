import mongoose from 'mongoose'

const automationLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    actionType: {
      // scale-out | restart-service | failover-db | drain-instance | increase-memory | notify
      type: String,
    },
    description: {
      type: String,
      required: true,
    },
    anomalyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Anomaly',
    },
    resourceId: {
      type: String,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'PENDING', 'triggered'],
      default: 'PENDING',
    },
    triggeredBy: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true, // createdAt = log timestamp
  }
)

automationLogSchema.index({ createdAt: -1 })
automationLogSchema.index({ status: 1, createdAt: -1 })

const AutomationLog = mongoose.model('AutomationLog', automationLogSchema)

export default AutomationLog
