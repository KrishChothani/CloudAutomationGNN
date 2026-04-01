/** @format */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AsyncHandler } from "../Utils/AsyncHandler.js";
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate presigned URL for S3 upload
 * This allows frontend to upload files directly to S3, bypassing the 10MB server limit
 * Files are stored with public-read ACL for easy access
 */
const generatePresignedUrl = AsyncHandler(async (req, res) => {
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    throw new ApiError(400, "fileName and fileType are required");
  }

  // Generate unique file key with timestamp to avoid conflicts
  const timestamp = Date.now();
  const fileKey = `documents/${timestamp}-${fileName}`;

  // Create the S3 command for PUT operation
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: fileKey,
    ContentType: fileType,
    ACL: "public-read", // Makes file publicly accessible
  });

  try {
    // Generate presigned URL valid for 1 hour (3600 seconds)
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    // Construct the public URL for accessing the file after upload
    const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          uploadUrl,
          fileUrl,
          fileKey,
        },
        "Presigned URL generated successfully"
      )
    );
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new ApiError(500, "Failed to generate presigned URL");
  }
});

export { generatePresignedUrl };