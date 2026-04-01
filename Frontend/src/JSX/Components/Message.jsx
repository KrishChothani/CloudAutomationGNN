// /** @format */

// import { Bot, User, Clipboard } from "lucide-react";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";
// import { motion } from "framer-motion";

// const Message = ({ message }) => {
//   const isUser = message.role === "user";

//   const handleCopy = () => {
//     navigator.clipboard.writeText(message.content);
//     // Optional: show a toast notification
//   };

//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 20 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ duration: 0.3 }}
//       className={`flex items-start gap-4 my-4 ${isUser ? "justify-end" : ""}`}
//     >
//       {!isUser && (
//         <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
//           <Bot className="w-6 h-6 text-blue-400" />
//         </div>
//       )}

//       <div
//         className={`group relative px-4 py-3 rounded-2xl max-w-xl lg:max-w-3xl ${
//           isUser ? "bg-blue-600 rounded-br-none" : "bg-gray-800 rounded-bl-none"
//         }`}
//       >
//         {/* --- FIX: Wrap ReactMarkdown in a div for styling --- */}
//         <div className="prose prose-invert prose-sm md:prose-base max-w-none">
//           <ReactMarkdown
//             // The `className` prop has been removed from here
//             remarkPlugins={[remarkGfm]}
//             components={{
//               // This part is correct and remains the same
//               pre: ({ node, ...props }) => (
//                 <pre className="bg-gray-900/80 p-3 rounded-md" {...props} />
//               ),
//               code: ({ node, ...props }) => (
//                 <code className="bg-gray-900/80 px-1 rounded-sm" {...props} />
//               ),
//             }}
//           >
//             {message.content}
//           </ReactMarkdown>
//         </div>

//         <button
//           onClick={handleCopy}
//           className="absolute -top-2 -right-2 p-1.5 bg-gray-700 rounded-full text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
//         >
//           <Clipboard className="w-4 h-4" />
//         </button>
//       </div>

//       {isUser && (
//         <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
//           <User className="w-6 h-6" />
//         </div>
//       )}
//     </motion.div>
//   );
// };

// export default Message;


/** @format */

import { Bot, User, Clipboard, CheckCircle2, AlertTriangle, LoaderCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { useMemo } from "react";

// Helper component for the status badge
const StatusBadge = ({ status }) => {
  const statusConfig = {
    processing: {
      icon: <LoaderCircle className="w-3 h-3 animate-spin" />,
      text: "Processing",
      color: "bg-blue-500/30 text-blue-300",
    },
    processed: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      text: "Completed",
      color: "bg-green-500/30 text-green-300",
    },
    failed: {
      icon: <AlertTriangle className="w-3 h-3" />,
      text: "Failed",
      color: "bg-red-500/30 text-red-300",
    },
  };

  const config = statusConfig[status] || statusConfig.processing;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${config.color}`}
    >
      {config.icon}
      {config.text}
    </span>
  );
};

// Main Message Component
const Message = ({ message, documents = [] }) => {
  const isUser = message.role === "user";

  const fileInfo = useMemo(() => {
    if (message.role === "system" && message.content.startsWith("File uploaded:")) {
      const fileNameMatch = message.content.match(/File uploaded: (.*?)\. Processing/);
      if (fileNameMatch && fileNameMatch[1]) {
        const fileName = fileNameMatch[1];
        const associatedDoc = documents.find(doc => doc.fileName === fileName);
        return {
          isUploadNotice: true,
          fileName: fileName,
          document: associatedDoc,
        };
      }
    }
    return { isUploadNotice: false };
  }, [message, documents]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start gap-4 my-4 ${isUser ? "justify-end" : ""}`}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Bot className="w-6 h-6 text-blue-400" />
        </div>
      )}

      <div
        className={`group relative px-4 py-3 rounded-2xl max-w-xl lg:max-w-3xl ${
          isUser ? "bg-blue-600 rounded-br-none" : "bg-gray-800 rounded-bl-none"
        }`}
      >
        <div className="prose prose-invert prose-sm md:prose-base max-w-none">
          {fileInfo.isUploadNotice ? (
            <div className="flex flex-col gap-2">
              <p className="font-medium">{`File: ${fileInfo.fileName}`}</p>
              <StatusBadge status={fileInfo.document?.status} />
              {fileInfo.document?.status === 'failed' && fileInfo.document.errorMessage && (
                  <p className="text-xs text-red-400 mt-1">Error: {fileInfo.document.errorMessage}</p>
              )}
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ node, ...props }) => <pre className="bg-gray-900/80 p-3 rounded-md" {...props} />,
                code: ({ node, ...props }) => <code className="bg-gray-900/80 px-1 rounded-sm" {...props} />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {!fileInfo.isUploadNotice && (
          <button
            onClick={handleCopy}
            className="absolute -top-2 -right-2 p-1.5 bg-gray-700 rounded-full text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Clipboard className="w-4 h-4" />
          </button>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
          <User className="w-6 h-6" />
        </div>
      )}
    </motion.div>
  );
};

export default Message;