/** @format */

import { ChevronDown } from "lucide-react";

const ModelSelector = ({ model, setModel }) => {
  const models = ["GPT-4o", "GPT-3.5-Turbo"];

  return (
    <div className="relative inline-block text-left">
      <div>
        <span className="rounded-md shadow-sm">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-700 bg-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md appearance-none"
          >
            {models.map((m) => (
              <option key={m}>{m}</option>
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

export default ModelSelector;
