/** @format */

import { ChevronDown } from "lucide-react";

// Renamed from ModelSelector to FeatureSelector for clarity
const FeatureSelector = ({ feature, setFeature }) => {
  // Use the exact strings from your MongoDB enum
  const features = {
    Smart_Chat: "🤖 Smart Chat (Text + Image)",
    Document_Analysis: "📄 Document Analysis",
    Analytical_Insights: "📈 Analytical Insights",
    General_Conversation: "💬 General Conversation",
    Multi_Document_Search: "📚 Multi-Document Search", // Can add later
  };

  return (
    <div className="relative inline-block text-left">
      <div>
        <span className="rounded-md shadow-sm">
          <select
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-700 bg-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md appearance-none"
          >
            {Object.entries(features).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
        <ChevronDown className="h-4 w-4" />
      </div>
    </div>
  );
};

export default FeatureSelector;
