/** @format */

import { useState } from "react";
import { Upload, X, FileText, AlertCircle, CheckCircle } from "lucide-react";
import {
  generatePresignedUrl,
  uploadToS3,
  registerS3Documents,
  uploadDocuments,
} from "../../services/apiClient";

const EnhancedFileUpload = ({ conversationId, onUploadComplete, isLoading, setIsLoading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // File size limit: 10MB for regular upload, unlimited for S3
  const MAX_REGULAR_SIZE = 10 * 1024 * 1024; // 10MB

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleFiles = async (files) => {
    if (!conversationId || files.length === 0) return;

    setIsLoading(true);
    const results = [];

    try {
      // Separate files by size - use S3 for large files, regular upload for small ones
      const largeFiles = files.filter(file => file.size > MAX_REGULAR_SIZE);
      const smallFiles = files.filter(file => file.size <= MAX_REGULAR_SIZE);

      // Handle small files with regular upload
      if (smallFiles.length > 0) {
        try {
          const response = await uploadDocuments(conversationId, smallFiles);
          results.push(...response.data.data);
        } catch (error) {
          console.error("Regular upload failed:", error);
          // If regular upload fails, try S3 for these files too
          largeFiles.push(...smallFiles);
        }
      }

      // Handle large files with S3 presigned URLs
      if (largeFiles.length > 0) {
        const s3Results = await handleS3Upload(largeFiles);
        results.push(...s3Results);
      }

      setUploadedFiles(prev => [...prev, ...results]);
      onUploadComplete(results);
      
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsLoading(false);
      setUploadProgress({});
    }
  };

  const handleS3Upload = async (files) => {
    const results = [];
    
    for (const file of files) {
      try {
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: "generating-url", progress: 0 }
        }));

        // Step 1: Generate presigned URL
        const urlResponse = await generatePresignedUrl(file.name, file.type);
        console.log(urlResponse);
        const { uploadUrl, fileUrl } = urlResponse.data.data;
        console.log(uploadUrl, fileUrl);
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: "uploading", progress: 25 }
        }));

        // Step 2: Upload to S3
        const uploadResponse = await uploadToS3(uploadUrl, file);
        
        if (!uploadResponse.ok) {
          throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
        }

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: "registering", progress: 75 }
        }));

        // Step 3: Register with backend
        const registerResponse = await registerS3Documents(conversationId, [{
          fileName: file.name,
          fileUrl: fileUrl,
          fileType: file.type
        }]);

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: "complete", progress: 100 }
        }));

        results.push(...registerResponse.data.data);

      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: "error", progress: 0, error: error.message }
        }));
      }
    }

    return results;
  };

  const removeFile = (fileName) => {
    setUploadedFiles(prev => prev.filter(file => file.document?.fileName !== fileName));
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileName];
      return newProgress;
    });
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? "border-blue-400 bg-blue-50/10"
            : "border-gray-600 hover:border-gray-500"
        } ${isLoading ? "opacity-50 pointer-events-none" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />
        
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-300 mb-2">
          Drop files here or click to browse
        </p>
        <p className="text-sm text-gray-500">
          Files over 10MB will be uploaded directly to S3 (no size limit)
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Supports: PDF, DOC, DOCX, TXT, and more
        </p>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Upload Progress</h4>
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-gray-300 truncate">{fileName}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {progress.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  ) : progress.status === "complete" ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
                  )}
                  <button
                    onClick={() => removeFile(fileName)}
                    className="text-gray-400 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    progress.status === "error"
                      ? "bg-red-500"
                      : progress.status === "complete"
                      ? "bg-green-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">
                  {progress.status === "generating-url" && "Generating upload URL..."}
                  {progress.status === "uploading" && "Uploading to S3..."}
                  {progress.status === "registering" && "Registering with backend..."}
                  {progress.status === "complete" && "Upload complete"}
                  {progress.status === "error" && `Error: ${progress.error}`}
                </span>
                <span className="text-xs text-gray-500">{progress.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recently Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Recently Uploaded</h4>
          <div className="space-y-1">
            {uploadedFiles.slice(-3).map((result, index) => (
              <div key={index} className="flex items-center space-x-2 text-sm text-gray-400">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span>{result.document?.fileName}</span>
                <span className="text-xs">
                  ({formatFileSize(result.document?.fileSize || 0)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedFileUpload;