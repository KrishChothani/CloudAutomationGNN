/** @format */

import mongoose, { Schema } from "mongoose";

const documentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    s3Url: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["uploading", "processing", "processed", "failed"],
      default: "uploading",
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    pineconeNamespace: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

export const Document = mongoose.model("Document", documentSchema);
