/** @format */

import { AsyncHandler } from "../Utils/AsyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import { Document } from "../Models/document.model.js";
import { Conversation } from "../Models/conversation.model.js";
import { Message } from "../Models/message.model.js";
import { User } from "../Models/user.model.js";
import axios from "axios";
import mongoose from "mongoose";

/**
 * @description Get all conversations for the logged-in user (for the sidebar)
 * @route GET /api/v1/conversations
 */
const getAllConversations = AsyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ user: req.user._id })
    .select("title createdAt updatedAt")
    .sort({ updatedAt: -1 });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        conversations,
        "Conversations retrieved successfully"
      )
    );
});

/**
 * @description Get a single conversation and all its messages
 * @route GET /api/v1/conversations/:conversationId
 */
const getConversationById = AsyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(400, "Invalid conversation ID");
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    user: req.user._id, // Ensure the user owns this conversation
  }).populate("documents");

  if (!conversation) {
    throw new ApiError(404, "Conversation not found");
  }

  const messages = await Message.find({ conversation: conversationId }).sort({
    createdAt: "asc",
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { 
          conversation, 
          messages, 
          documents: conversation.documents 
        },
        "Conversation details retrieved successfully"
      )
    );
});

/**
 * @description Create a new conversation (when user clicks "New Chat")
 * @route POST /api/v1/conversations
 */
const createConversation = AsyncHandler(async (req, res) => {
  const { title, featureUsed } = req.body;
  
  const conversation = await Conversation.create({
    user: req.user._id,
    title: title || "New Chat",
    featureUsed: featureUsed || "Smart_Chat", // Use the provided feature or default
  });

  // Add the new conversation to the user's list of conversations
  await User.findByIdAndUpdate(req.user._id, {
    $push: { conversations: conversation._id },
  });

  return res
    .status(201)
    .json(
      new ApiResponse(201, conversation, "Conversation created successfully")
    );
});

/**
 * Helper function to generate a conversation title from the first message
 */
const generateConversationTitle = (message) => {
  // Clean and truncate the message to create a meaningful title
  const cleanMessage = message.trim().replace(/\s+/g, ' ');
  
  // Handle empty or very short messages
  if (!cleanMessage) {
    return "New Conversation";
  }
  
  if (cleanMessage.length <= 50) {
    return cleanMessage;
  }
  
  // For longer messages, try to find a natural break point
  const words = cleanMessage.split(' ');
  let title = '';
  
  for (const word of words) {
    const testTitle = title ? `${title} ${word}` : word;
    if (testTitle.length > 47) { // Leave room for "..."
      break;
    }
    title = testTitle;
  }
  
  // If we couldn't fit any words, just truncate
  if (!title) {
    title = cleanMessage.substring(0, 47);
  }
  
  // Add ellipsis if we truncated
  if (title.length < cleanMessage.length) {
    title += '...';
  }
  
  return title;
};

/**
 * @description Handles a new chat message from a user in a specific conversation.
 * @route POST /api/v1/conversations/:conversationId/messages
 */
 const createChatMessage = AsyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!content || content.trim() === "") {
    throw new ApiError(400, "Message content cannot be empty.");
  }
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(400, "Invalid conversation ID.");
  }

  // 1. Verify the user owns this conversation and get its details, including the featureUsed mode
  const conversation = await Conversation.findOne({
    _id: conversationId,
    user: userId,
  }).populate("documents");

  if (!conversation) {
    throw new ApiError(404, "Conversation not found or access denied.");
  }

  // 2. Check if this is the first user message and update title if needed
  const existingMessages = await Message.countDocuments({ 
    conversation: conversationId,
    role: "user" 
  });
  
  const isFirstMessage = existingMessages === 0;
  
  // 3. Save the user's message to the database
  await Message.create({
    conversation: conversationId,
    role: "user",
    content: content,
  });

  // 4. Update conversation title if this is the first message and title is still "New Chat"
  if (isFirstMessage && conversation.title === "New Chat") {
    const newTitle = generateConversationTitle(content);
    console.log(`Updating conversation title from "${conversation.title}" to "${newTitle}"`);
    await Conversation.findByIdAndUpdate(conversationId, { 
      title: newTitle,
      updatedAt: new Date()
    });
  }

  // 5. Prepare data for the Python AI service
  const chatHistory = await Message.find({ conversation: conversationId })
    .sort({ createdAt: "asc" })
    .select("role content -_id") // Exclude _id to keep payload clean
    .limit(20);

  const pineconeNamespaces = conversation.documents
    .filter((doc) => doc.status === "processed")
    .map((doc) => doc.pineconeNamespace);

  // 6. Call the Python AI service, passing the feature mode
  let aiContent;
  try {
    const response = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/query`,
      {
        question: content,
        chatHistory: chatHistory,
        pineconeNamespaces: pineconeNamespaces,
        featureUsed: conversation.featureUsed, // <-- THE CRITICAL CHANGE
      }
    );
    aiContent = response.data.answer;
  } catch (error) {
    console.error(
      "Error calling Python AI service:",
      error.response ? error.response.data : error.message
    );
    throw new ApiError(
      502,
      "The AI service is currently unavailable. Please try again later."
    );
  }

  if (!aiContent || aiContent.trim() === "") {
    throw new ApiError(
      500,
      "Received an empty or invalid response from the AI service."
    );
  }

  // 7. Save the AI's response to the database
  const assistantMessage = await Message.create({
    conversation: conversationId,
    role: "assistant",
    content: aiContent,
  });

  // 8. Return the AI's message to the frontend
  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        assistantMessage,
        "AI response generated successfully"
      )
    );
});

/**
 * @description Delete a conversation and all its associated data
 * @route DELETE /api/v1/conversations/:conversationId
 */
const deleteConversation = AsyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(400, "Invalid conversation ID");
  }

  // Use a transaction to ensure all or nothing is deleted
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const conversation = await Conversation.findOneAndDelete({
      _id: conversationId,
      user: req.user._id,
    }).session(session);

    if (!conversation) {
      throw new ApiError(
        404,
        "Conversation not found or you don't have permission to delete it."
      );
    }

    // 1. Delete all messages in the conversation
    await Message.deleteMany({ conversation: conversationId }).session(session);

    // 2. Find all associated documents to get their S3 URLs and Pinecone namespaces
    const docsToDelete = await Document.find({
      conversation: conversationId,
    }).session(session);

    if (docsToDelete.length > 0) {
      // IMPORTANT: Trigger deletion from S3 and Pinecone via your Python service.
      // This is a "fire-and-forget" call; we don't wait for its response.
      axios
        .post(`${process.env.PYTHON_SERVICE_URL}/delete-documents`, {
          documents: docsToDelete.map((doc) => ({
            s3Url: doc.s3Url,
            pineconeNamespace: doc.pineconeNamespace,
          })),
        })
        .catch((err) => {
          console.error(
            "Failed to trigger cleanup service for conversation",
            conversationId,
            err.message
          );
        });

      // Delete the document records from MongoDB
      await Document.deleteMany({ conversation: conversationId }).session(
        session
      );
    }

    // 3. Remove the conversation reference from the user's document
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { conversations: conversationId },
    }).session(session);

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Conversation deleted successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw new ApiError(500, error?.message || "Failed to delete conversation.");
  } finally {
    session.endSession();
  }
});

/**
 * @description Update conversation feature mode
 * @route PATCH /api/v1/conversations/:conversationId/feature
 */
const updateConversationFeature = AsyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { featureUsed } = req.body;

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(400, "Invalid conversation ID");
  }

  if (!featureUsed) {
    throw new ApiError(400, "Feature mode is required");
  }

  const validFeatures = [
    "General_Conversation",
    "Document_Analysis", 
    "Analytical_Insights",
    "Multi_Document_Search",
    "Smart_Chat"
  ];

  if (!validFeatures.includes(featureUsed)) {
    throw new ApiError(400, "Invalid feature mode");
  }

  const conversation = await Conversation.findOneAndUpdate(
    {
      _id: conversationId,
      user: req.user._id, // Ensure user owns this conversation
    },
    { featureUsed },
    { new: true }
  );

  if (!conversation) {
    throw new ApiError(404, "Conversation not found or access denied");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, conversation, "Conversation feature updated successfully")
    );
});

/**
 * @description Update conversation title
 * @route PATCH /api/v1/conversations/:conversationId/title
 */
const updateConversationTitle = AsyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { title } = req.body;

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(400, "Invalid conversation ID");
  }

  if (!title || title.trim() === "") {
    throw new ApiError(400, "Title is required");
  }

  const conversation = await Conversation.findOneAndUpdate(
    {
      _id: conversationId,
      user: req.user._id, // Ensure user owns this conversation
    },
    { title: title.trim(), updatedAt: new Date() },
    { new: true }
  );

  if (!conversation) {
    throw new ApiError(404, "Conversation not found or access denied");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, conversation, "Conversation title updated successfully")
    );
});

export {
  getAllConversations,
  getConversationById,
  createConversation,
  createChatMessage,
  deleteConversation,
  updateConversationFeature,
  updateConversationTitle,
};
