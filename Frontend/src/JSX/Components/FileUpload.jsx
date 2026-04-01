/** @format */

import { Upload, File, X, LoaderCircle } from "lucide-react";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";

const FileUpload = ({ onUpload, disabled }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles) => {
    setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] }, // Accept only PDFs for now
    disabled,
  });

  const handleRemoveFile = (fileName) => {
    setFiles(files.filter((file) => file.name !== fileName));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    await onUpload(files); 
    setUploading(false);
    setFiles([]); 
  };

  return (
    <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
      <div
        {...getRootProps()}
        className={`p-6 border-2 border-dashed border-gray-600 rounded-lg text-center cursor-pointer hover:border-blue-500 transition-colors ${
          isDragActive ? "border-blue-500 bg-gray-800" : ""
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-500" />
        <p className="mt-2 text-sm text-gray-400">
          {isDragActive
            ? "Drop the files here..."
            : "Drag 'n' drop some files here, or click to select files"}
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-4">
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li
                key={index}
                className="flex items-center justify-between bg-gray-800 p-2 rounded"
              >
                <div className="flex items-center gap-2">
                  <File className="h-5 w-5 text-gray-400" />
                  <span className="text-sm truncate">{file.name}</span>
                </div>
                <button
                  onClick={() => handleRemoveFile(file.name)}
                  className="p-1 hover:bg-gray-700 rounded-full"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:bg-green-800"
          >
            {uploading ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" />
                Uploading...
              </>
            ) : (
              `Upload ${files.length} File(s)`
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
