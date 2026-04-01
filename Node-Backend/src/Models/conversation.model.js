/** @format */

import mongoose, { Schema } from "mongoose";

const conversationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      default: "New Chat",
      trim: true,
    },
    documents: [
      {
        type: Schema.Types.ObjectId,
        ref: "Document",
      },
    ],
    featureUsed: {
      type: String,
      enum: [
        "General_Conversation", // Normal chat, definitions, or finance Q&A
        "Document_Analysis", // PDF/Excel understanding
        "Analytical_Insights", // Ratio/trend/calculation queries
        "Multi_Document_Search", // Cross-company/period comparison
        "Smart_Chat", // Unified intelligent mode
      ],
      default: "Smart_Chat",
    },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
