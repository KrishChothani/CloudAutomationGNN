import mongoose from 'mongoose'

const anomalySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    resourceId: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      required: true,
    },
    explanation: {
      // Natural language explanation from LLM / explanation_builder
      type: String,
    },
    shapValues: {
      // Feature name → SHAP importance dict
      type: mongoose.Schema.Types.Mixed,
    },
    affectedNodes: [
      {
        nodeId: String,
        nodeType: String,
      },
    ],
    action: {
      // Remediation action taken
      type: String,
    },
    actionStatus: {
      type: String,
      enum: ['pending', 'triggered', 'success', 'failed'],
      default: 'pending',
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
)

anomalySchema.index({ score: -1, createdAt: -1 })
anomalySchema.index({ severity: 1, resolved: 1 })

const Anomaly = mongoose.model('Anomaly', anomalySchema)

export default Anomaly
