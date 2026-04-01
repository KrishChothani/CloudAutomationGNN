/** @format */

import { Router } from "express";
import {
  getAllConversations,
  getConversationById,
  createConversation,
  createChatMessage, // <-- Import the new chat message controller
  deleteConversation,
  updateConversationFeature,
  updateConversationTitle,
} from "../Controllers/conversation.controller.js";
import { verifyJWT } from "../Middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.route("/").get(getAllConversations).post(createConversation);

router
  .route("/:conversationId")
  .get(getConversationById)
  .delete(deleteConversation);

router.route("/:conversationId/messages").post(createChatMessage);

router.route("/:conversationId/feature").patch(updateConversationFeature);

router.route("/:conversationId/title").patch(updateConversationTitle);

export default router;
