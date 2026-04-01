/** @format */

import { Message } from "../Models/message.model.js";
import { Conversation } from "../Models/conversation.model.js";
import { Document } from "../Models/document.model.js";
import axios from "axios";

const handleNewChatMessage = async (socket, data) => {
  try {
    const { conversationId, content } = data;
    console.log("handleNewChatMessage called with data:", data, conversationId);
    console.log(socket.user , socket.user._id);
    if (!socket.user || !socket.user._id) {
      socket.emit("chatError", {
        message: "Authentication failed. Please reconnect.",
      });
      return;
    }
    const userId = socket.user._id;
    console.log("User ID:", userId);
    const userMessage = await Message.create({
      conversation: conversationId,
      role: "user",
      content: content,
      messageType: "text",
    });

    console.log("User Message:", userMessage);
    // --- IMPROVEMENT ---
    // Use `socket.nsp.to(...)` to emit to ALL clients in the room, including the sender.
    socket.nsp.to(conversationId).emit("newMessage", userMessage);

    const conversation = await Conversation.findById(conversationId).populate(
      "documents"
    );
    if (!conversation || conversation.user.toString() !== userId.toString()) {
      throw new Error("Conversation not found or access denied.");
    }
    console.log("Conversation:", conversation);


    const chatHistory = await Message.find({ conversation: conversationId })
      .sort({ createdAt: "asc" })
      .limit(20);
    console.log("Chat History:", chatHistory);

    const pineconeNamespaces = conversation.documents
      .filter((doc) => doc.status === "processed")
      .map((doc) => doc.pineconeNamespace);

    console.log("Pinecone Namespaces:", pineconeNamespaces);

    

    const response = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/query`,
      {
        question: content,
        chatHistory: chatHistory,
        pineconeNamespaces: pineconeNamespaces,
      }
    );
    console.log("AI Response:", response.data);

    const aiContent = response.data.answer;

    console.log("AI Content:", aiContent);

    const assistantMessage = await Message.create({
      conversation: conversationId,
      role: "assistant",
      content: aiContent,
      messageType: "text",
    });
    console.log("Assistant Message:", assistantMessage);

    socket.nsp.to(conversationId).emit("newMessage", assistantMessage);
  } catch (error) {
    console.error("Socket chat error:", error.message);
    socket.emit("chatError", {
      message: "An error occurred while getting a response.",
    });
  }
};

export { handleNewChatMessage };
