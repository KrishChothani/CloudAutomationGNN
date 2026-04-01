// /** @format */

// // src/JSX/Components/ChatInput.jsx
// /** @format */

// import { Send, LoaderCircle, Paperclip } from "lucide-react";
// import { useRef } from "react";

// const ChatInput = ({
//   input,
//   setInput,
//   handleSend,
//   isLoading,
//   handleFileUpload, // New prop
// }) => {
//   const fileInputRef = useRef(null);

//   const handleKeyDown = (e) => {
//     if (e.key === "Enter" && !e.shiftKey) {
//       e.preventDefault();
//       if (!isLoading) handleSend();
//     }
//   };

//   const onFileSelect = (e) => {
//     const files = Array.from(e.target.files);
//     if (files.length > 0) {
//       handleFileUpload(files);
//     }
//     // Reset file input to allow selecting the same file again
//     e.target.value = null;
//   };

//   return (
//     <div className="relative flex items-center">
//       {/* Hidden file input */}
//       <input
//         type="file"
//         multiple
//         ref={fileInputRef}
//         onChange={onFileSelect}
//         className="hidden"
//         accept=".pdf,.csv,.xlsx,.xls"
//       />

//       {/* File upload button */}
//       <button
//         onClick={() => fileInputRef.current.click()}
//         disabled={isLoading}
//         className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white disabled:opacity-50"
//         title="Upload Documents"
//       >
//         <Paperclip className="w-5 h-5" />
//       </button>

//       <textarea
//         value={input}
//         onChange={(e) => setInput(e.target.value)}
//         onKeyDown={handleKeyDown}
//         placeholder="Ask anything..."
//         className="w-full resize-none bg-gray-800 border border-gray-700 rounded-xl py-3 pl-12 pr-16 focus:outline-none focus:ring-2 focus:ring-blue-500" // Increased left padding
//         rows={1}
//       />
//       <button
//         onClick={handleSend}
//         disabled={isLoading || input.trim() === ""}
//         className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
//       >
//         {isLoading ? (
//           <LoaderCircle className="w-5 h-5 animate-spin" />
//         ) : (
//           <Send className="w-5 h-5" />
//         )}
//       </button>
//     </div>
//   );
// };

// export default ChatInput;

/** @format */

import { Send, LoaderCircle, Paperclip, FileText, X } from "lucide-react";
import { useRef, useState } from "react";

const ChatInput = ({
  input,
  setInput,
  onSend, // This is the new combined send function from App.jsx
  isLoading,
}) => {
  const fileInputRef = useRef(null);
  const [stagedFiles, setStagedFiles] = useState([]); // State for selected files

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && (input.trim() !== "" || stagedFiles.length > 0)) {
        handleSendClick();
      }
    }
  };

  const onFileSelect = (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length > 0) {
      setStagedFiles((prevFiles) => [...prevFiles, ...newFiles]);
    }
    e.target.value = null; // Reset file input
  };

  const removeFile = (fileName) => {
    setStagedFiles(stagedFiles.filter((file) => file.name !== fileName));
  };

  const handleSendClick = () => {
    if (input.trim() === "" && stagedFiles.length === 0) return;
    onSend(input, stagedFiles); // Pass both text and files to the parent component
    setInput("");
    setStagedFiles([]);
  };

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={onFileSelect}
        className="hidden"
        accept=".pdf,.csv,.xlsx,.xls"
      />

      {/* Staged Files Display Area */}
      {stagedFiles.length > 0 && (
        <div className="p-3 bg-gray-900 border border-b-0 border-gray-700 rounded-t-xl">
          <div className="flex flex-wrap gap-2">
            {stagedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-gray-700/50 rounded-full pl-3 pr-1 text-sm text-gray-200 animate-in fade-in-5 duration-300"
              >
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate max-w-[200px]">{file.name}</span>
                <button
                  onClick={() => removeFile(file.name)}
                  className="p-1 rounded-full hover:bg-red-500/50 text-gray-400 hover:text-white"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Input Area */}
      <div className="relative flex items-center">
        <button
          onClick={() => fileInputRef.current.click()}
          disabled={isLoading}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white disabled:opacity-50"
          title="Attach Documents"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything or attach files..."
          className={`w-full resize-none bg-gray-800 border border-gray-700 py-3 pl-12 pr-16 focus:outline-none focus:ring-2 focus:ring-blue-500
            ${stagedFiles.length > 0 ? "rounded-b-xl rounded-t-none" : "rounded-xl"} 
          `}
          rows={1}
        />
        <button
          onClick={handleSendClick}
          disabled={
            isLoading || (input.trim() === "" && stagedFiles.length === 0)
          }
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <LoaderCircle className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
};

export default ChatInput;