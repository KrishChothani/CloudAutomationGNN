/** @format */

import { AsyncHandler } from "../Utils/AsyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import { Document } from "../Models/document.model.js";
import { Conversation } from "../Models/conversation.model.js";
import { Message } from "../Models/message.model.js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import mongoose from "mongoose";

const uploadDocuments = AsyncHandler(async (req, res) => {
  const { conversationId } = req.body;
  const files = req.files;

  if (!files || files.length === 0) {
    throw new ApiError(400, "No files uploaded.");
  }
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(400, "Invalid conversation ID");
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    user: req.user._id,
  });

  if (!conversation) {
    throw new ApiError(404, "Conversation not found for this user.");
  }

  // Check if this is the first interaction and update title if needed
  const existingMessages = await Message.countDocuments({ 
    conversation: conversationId 
  });
  
  const isFirstInteraction = existingMessages === 0;

  const processingPromises = files.map(async (file) => {
    const newDocument = await Document.create({
      user: req.user._id,
      conversation: conversationId,
      fileName: file.originalname,
      s3Url: file.location,
      fileType: file.mimetype,
      status: "processing",
      pineconeNamespace: `doc-${uuidv4()}`,
    });

    const systemMessage = await Message.create({
      conversation: conversationId,
      role: "system",
      content: `File uploaded: ${newDocument.fileName}. Processing...`,
    });

    axios
      .post(`${process.env.PYTHON_SERVICE_URL}/process-document`, {
        documentId: newDocument._id.toString(),
        s3Url: newDocument.s3Url,
        pineconeNamespace: newDocument.pineconeNamespace,
      })
      .catch((err) => {
        console.error(
          `Failed to trigger Python processing for doc ${newDocument._id}:`,
          err.message
        );
      });

    return { document: newDocument, message: systemMessage };
  });

  const results = await Promise.all(processingPromises);
  const newDocumentIds = results.map((result) => result.document._id);

  // Update conversation with new documents
  const updateData = {
    $push: { documents: { $each: newDocumentIds } },
    updatedAt: new Date()
  };

  // Update title if this is the first interaction and title is still "New Chat"
  if (isFirstInteraction && conversation.title === "New Chat") {
    const fileNames = files.map(file => file.originalname).join(", ");
    updateData.title = `Document Analysis: ${fileNames.length > 40 ? fileNames.substring(0, 37) + "..." : fileNames}`;
  }

  await Conversation.findByIdAndUpdate(conversationId, updateData);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        results,
        `${files.length} file(s) uploaded and processing started.`
      )
    );
});

// New function to handle S3 direct uploads (bypasses 10MB limit)
const uploadDocumentsViaS3 = AsyncHandler(async (req, res) => {
  const { conversationId, documents } = req.body;

  if (!documents || documents.length === 0) {
    throw new ApiError(400, "No documents provided.");
  }
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(400, "Invalid conversation ID");
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    user: req.user._id,
  });

  if (!conversation) {
    throw new ApiError(404, "Conversation not found for this user.");
  }

  // Check if this is the first interaction and update title if needed
  const existingMessages = await Message.countDocuments({ 
    conversation: conversationId 
  });
  
  const isFirstInteraction = existingMessages === 0;

  const processingPromises = documents.map(async (doc) => {
    const { fileName, fileUrl, fileType } = doc;
    
    const newDocument = await Document.create({
      user: req.user._id,
      conversation: conversationId,
      fileName: fileName,
      s3Url: fileUrl,
      fileType: fileType,
      status: "processing",
      pineconeNamespace: `doc-${uuidv4()}`,
    });

    const systemMessage = await Message.create({
      conversation: conversationId,
      role: "system",
      content: `File uploaded: ${newDocument.fileName}. Processing...`,
    });

    // Trigger Python processing
    axios
      .post(`${process.env.PYTHON_SERVICE_URL}/process-document`, {
        documentId: newDocument._id.toString(),
        s3Url: newDocument.s3Url,
        pineconeNamespace: newDocument.pineconeNamespace,
      })
      .catch((err) => {
        console.error(
          `Failed to trigger Python processing for doc ${newDocument._id}:`,
          err.message
        );
      });

    return { document: newDocument, message: systemMessage };
  });

  const results = await Promise.all(processingPromises);
  const newDocumentIds = results.map((result) => result.document._id);

  // Update conversation with new documents
  const updateData = {
    $push: { documents: { $each: newDocumentIds } },
    updatedAt: new Date()
  };

  // Update title if this is the first interaction and title is still "New Chat"
  if (isFirstInteraction && conversation.title === "New Chat") {
    const fileNames = documents.map(doc => doc.fileName).join(", ");
    updateData.title = `Document Analysis: ${fileNames.length > 40 ? fileNames.substring(0, 37) + "..." : fileNames}`;
  }

  await Conversation.findByIdAndUpdate(conversationId, updateData);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        results,
        `${documents.length} file(s) uploaded and processing started.`
      )
    );
});

const updateDocumentStatusWebhook = AsyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const { status, errorMessage } = req.body;

  if (!["processed", "failed"].includes(status)) {
    throw new ApiError(400, "Invalid status provided.");
  }

  const document = await Document.findByIdAndUpdate(
    documentId,
    { $set: { status: status, errorMessage: errorMessage || null } },
    { new: true }
  );

  if (!document) {
    throw new ApiError(404, "Document not found");
  }

  // Update or create a system message about the processing result
  const statusMessage = status === "processed" 
    ? `File processed successfully: ${document.fileName}. You can now ask questions about this document.`
    : `Failed to process file: ${document.fileName}. ${errorMessage || 'Unknown error occurred.'}`;

  await Message.create({
    conversation: document.conversation,
    role: "system",
    content: statusMessage,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, document, "Document status updated."));
});

export { uploadDocuments, uploadDocumentsViaS3, updateDocumentStatusWebhook };
