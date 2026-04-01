/** @format */

import { Router } from "express";
import { generatePresignedUrl } from "../Controllers/s3.controller.js";
import { verifyJWT } from "../Middlewares/auth.middleware.js";

const router = Router();

// Protected route - requires authentication
router.route("/generate-presigned-url").post(verifyJWT, generatePresignedUrl);

export default router;