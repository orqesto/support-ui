import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { Message } from '@/types';

type MessageAIAnalysisProps = {
  message: Message;
};

export const MessageAIAnalysis = ({ message }: MessageAIAnalysisProps) => {
  // Extract AI analysis from metadata
  const analysis = message.metadata?.analysis as
    | {
        isTicketWorthy?: boolean;
        needsMoreInfo?: boolean;
        suggestedCategory?: string;
        suggestedPriority?: string;
        confidence?: number;
        summary?: string;
        embeddingProvider?: string;
        embeddingModel?: string;
        analysisProvider?: string;
        analysisModel?: string;
      }
    | undefined;

  const spamCheck = message.metadata?.spamCheck as
    | {
        isSpam?: boolean;
        confidence?: number;
        category?: string;
        reason?: string;
        redFlags?: string[];
      }
    | undefined;

  // Don't render if no AI analysis data
  if (!analysis && !spamCheck) {
    return null;
  }

  return (
    <div className="pt-6 border-t">
      <h3 className="mb-4 text-sm font-semibold text-muted-foreground">AI Analysis</h3>
      <div className="space-y-4">
        {/* Status Indicators */}
        <div className="grid grid-cols-2 gap-3">
          {/* Spam Check */}
          {spamCheck && (
            <div
              className={`p-3 rounded-lg border ${
                spamCheck.isSpam === false
                  ? 'bg-green-500/10 dark:bg-green-500/10 border-green-500/20'
                  : spamCheck.isSpam === true
                    ? 'bg-red-500/10 dark:bg-red-500/10 border-red-500/20'
                    : 'bg-muted border-border'
              }`}
            >
              <div className="flex gap-2 items-center mb-1">
                {spamCheck.isSpam === false ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : spamCheck.isSpam === true ? (
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                ) : (
                  <Info className="w-4 h-4 text-gray-600" />
                )}
                <span className="text-xs font-semibold">Spam Check</span>
              </div>
              <p className="text-sm font-medium">
                {spamCheck.isSpam === false
                  ? 'Not Spam'
                  : spamCheck.isSpam === true
                    ? 'Spam Detected'
                    : 'Unknown'}
              </p>
              {spamCheck.category && (
                <p className="mt-1 text-xs capitalize text-muted-foreground">{spamCheck.category}</p>
              )}
            </div>
          )}

          {/* Ticket Worthy */}
          {analysis && (
            <div
              className={`p-3 rounded-lg border ${
                analysis.isTicketWorthy
                  ? 'bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20'
                  : 'bg-muted border-border'
              }`}
            >
              <div className="flex gap-2 items-center mb-1">
                {analysis.isTicketWorthy ? (
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                ) : (
                  <Info className="w-4 h-4 text-gray-600" />
                )}
                <span className="text-xs font-semibold">Ticket Worthy</span>
              </div>
              <p className="text-sm font-medium">{analysis.isTicketWorthy ? 'Yes' : 'No'}</p>
              {analysis.confidence !== undefined && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Confidence: {Math.round(analysis.confidence * 100)}%
                </p>
              )}
            </div>
          )}

          {/* Needs More Info */}
          {analysis?.needsMoreInfo !== undefined && (
            <div
              className={`p-3 rounded-lg border ${
                analysis.needsMoreInfo
                  ? 'bg-yellow-500/10 dark:bg-yellow-500/10 border-yellow-500/20'
                  : 'bg-green-500/10 dark:bg-green-500/10 border-green-500/20'
              }`}
            >
              <div className="flex gap-2 items-center mb-1">
                {analysis.needsMoreInfo ? (
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                )}
                <span className="text-xs font-semibold">Info Complete</span>
              </div>
              <p className="text-sm font-medium">
                {analysis.needsMoreInfo ? 'Needs More Info' : 'Complete'}
              </p>
            </div>
          )}

          {/* Priority */}
          {analysis?.suggestedPriority && (
            <div className="p-3 rounded-lg border bg-purple-500/10 dark:bg-purple-500/10 border-purple-500/20">
              <div className="flex gap-2 items-center mb-1">
                <Info className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-semibold">Priority</span>
              </div>
              <p className="text-sm font-medium capitalize">{analysis.suggestedPriority}</p>
            </div>
          )}
        </div>

        {/* Category */}
        {analysis?.suggestedCategory && (
          <div className="p-3 rounded-lg border bg-indigo-500/10 dark:bg-indigo-500/10 border-indigo-500/20">
            <div className="flex gap-2 items-center mb-1">
              <Info className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold">Suggested Category</span>
            </div>
            <p className="text-sm font-medium">{analysis.suggestedCategory}</p>
          </div>
        )}

        {/* Summary */}
        {analysis?.summary && (
          <div className="p-3 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
            <div className="flex gap-2 items-center mb-2">
              <Info className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold">AI Summary</span>
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400">{analysis.summary}</p>
          </div>
        )}

        {/* Spam Reason */}
        {spamCheck?.reason && (
          <div className="p-3 rounded-lg border bg-muted border-border">
            <div className="flex gap-2 items-center mb-2">
              <Info className="w-4 h-4 text-gray-600" />
              <span className="text-xs font-semibold">Detection Reason</span>
            </div>
            <p className="text-sm text-muted-foreground">{spamCheck.reason}</p>
          </div>
        )}

        {/* Red Flags */}
        {spamCheck?.redFlags && spamCheck.redFlags.length > 0 && (
          <div className="p-3 rounded-lg border bg-red-500/10 dark:bg-red-500/10 border-red-500/20">
            <div className="flex gap-2 items-center mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-semibold">Red Flags</span>
            </div>
            <ul className="space-y-1">
              {spamCheck.redFlags.map((flag: string) => (
                <li
                  key={flag}
                  className="flex gap-2 items-start text-sm text-red-600 dark:text-red-400"
                >
                  <span className="mt-1">•</span>
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Models Used */}
        {(message.analysisProvider ?? message.embeddingProvider) && (
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 dark:bg-gray-800/50 dark:border-gray-700">
            <div className="flex gap-2 items-center mb-2">
              <Info className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <span className="text-xs font-semibold">AI Models Used</span>
            </div>
            <div className="space-y-2 text-xs">
              {message.analysisProvider && (
                <div>
                  <span className="text-muted-foreground">Analysis: </span>
                  <span className="font-mono font-medium">
                    {message.analysisProvider}
                    {message.analysisModel && ` (${message.analysisModel})`}
                  </span>
                </div>
              )}
              {message.embeddingProvider && (
                <div>
                  <span className="text-muted-foreground">Embedding: </span>
                  <span className="font-mono font-medium">
                    {message.embeddingProvider}
                    {message.embeddingModel && ` (${message.embeddingModel})`}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
