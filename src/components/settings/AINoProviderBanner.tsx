import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export const AINoProviderBanner = () => {
  const [showFeatureDetails, setShowFeatureDetails] = useState(false);

  return (
    <div className="p-3 bg-amber-50 rounded-lg border-2 border-amber-500 dark:bg-amber-950/50">
      <button
        onClick={() => setShowFeatureDetails(!showFeatureDetails)}
        className="flex justify-between items-center w-full text-left"
      >
        <div className="flex gap-2 items-center">
          <AlertCircle className="flex-shrink-0 w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
            No AI provider configured. Some features unavailable.
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-amber-700 dark:text-amber-300">Details</span>
          {showFeatureDetails ? (
            <ChevronUp className="w-4 h-4 text-amber-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-amber-600" />
          )}
        </div>
      </button>

      {showFeatureDetails && (
        <div className="grid grid-cols-1 gap-3 mt-3 text-xs md:grid-cols-2">
          {/* Features that work */}
          <div className="p-2 rounded border bg-background">
            <h4 className="flex gap-1.5 items-center mb-1.5 font-semibold text-xs">
              <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              Works Without AI
            </h4>
            <ul className="space-y-0.5 text-muted-foreground text-xs">
              <li>• Email ingestion</li>
              <li>• Manual tickets</li>
              <li>• Basic spam filter</li>
              <li>• Local embeddings</li>
            </ul>
          </div>

          {/* Features that require AI */}
          <div className="p-2 rounded border bg-background">
            <h4 className="flex gap-1.5 items-center mb-1.5 font-semibold text-xs">
              <XCircle className="w-3.5 h-3.5 text-red-600" />
              Requires AI Provider
            </h4>
            <ul className="space-y-0.5 text-muted-foreground text-xs">
              <li>• Auto-reply</li>
              <li>• Follow-up questions</li>
              <li>• Smart priority</li>
              <li>• Advanced spam detection</li>
              <li>• AI summaries</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
