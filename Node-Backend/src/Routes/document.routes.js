/** @format */

import { Router } from "express";
import {
  uploadDocuments,
  uploadDocumentsViaS3,
  updateDocumentStatusWebhook,
} from "../Controllers/document.controller.js";
import { verifyJWT } from "../Middlewares/auth.middleware.js";
import { upload } from "../Middlewares/multer.middleware.js";

const router = Router();

router.post(
  "/upload",
  verifyJWT,
  upload.array("documents", 10),
  uploadDocuments
);

// New route for S3 direct uploads (bypasses 10MB limit)
router.post("/upload-s3", verifyJWT, uploadDocumentsViaS3);

router.patch("/:documentId/status/webhook", updateDocumentStatusWebhook);

export default router;
