import { MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type AIAutoReplyCardProps = {
  autoReplyEnabled: boolean;
  requestMissingInfo: boolean;
  suggestSolutions: boolean;
  // Parent owns the canonical threshold; only the editable tempThreshold is displayed here.
  tempThreshold: number;
  savingAutoReply: boolean;
  thresholdSaved: boolean;
  onAutoReplyChange: (enabled: boolean) => void;
  onRequestMissingInfoChange: (enabled: boolean) => void;
  onSuggestSolutionsChange: (enabled: boolean) => void;
  onThresholdChange: (threshold: number) => void;
  onThresholdSave: () => void;
};

export const AIAutoReplyCard = ({
  autoReplyEnabled,
  requestMissingInfo,
  suggestSolutions,
  tempThreshold,
  savingAutoReply,
  thresholdSaved,
  onAutoReplyChange,
  onRequestMissingInfoChange,
  onSuggestSolutionsChange,
  onThresholdChange,
  onThresholdSave,
}: AIAutoReplyCardProps) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <MessageCircle className="w-5 h-5" />
          AI Auto-Reply
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            AI automatically replies to customer messages in two ways:
          </p>
          <div className="pl-4 space-y-1 text-sm text-muted-foreground">
            <p>
              <strong>1. Request Missing Info:</strong> Asks customers for more details when
              messages are incomplete
            </p>
            <p>
              <strong>2. Suggest Solutions:</strong> Searches documentation, resolved tickets,
              and previous messages to reply with solutions
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <label className="flex gap-3 items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={autoReplyEnabled}
                  onChange={(event) => onAutoReplyChange(event.target.checked)}
                  disabled={savingAutoReply}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
              </div>
              <span className="text-sm font-medium">
                {autoReplyEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
            {savingAutoReply && (
              <span className="text-sm text-muted-foreground">Saving...</span>
            )}
          </div>

          {/* Request Missing Info Toggle */}
          {autoReplyEnabled && (
            <div className="pt-2 space-y-2 border-t">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Request Missing Information</p>
                  <p className="text-xs text-muted-foreground">
                    AI asks customers for more details when messages are incomplete
                  </p>
                </div>
                <label className="flex gap-3 items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={requestMissingInfo}
                      onChange={(event) => onRequestMissingInfoChange(event.target.checked)}
                      disabled={savingAutoReply}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                  </div>
                  <span className="text-sm font-medium">
                    {requestMissingInfo ? 'On' : 'Off'}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Suggest Solutions Toggle */}
          {autoReplyEnabled && (
            <div className="pt-2 space-y-2 border-t">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Suggest Solutions</p>
                  <p className="text-xs text-muted-foreground">
                    AI searches docs, tickets, and messages to suggest solutions
                  </p>
                </div>
                <label className="flex gap-3 items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={suggestSolutions}
                      onChange={(event) => onSuggestSolutionsChange(event.target.checked)}
                      disabled={savingAutoReply}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                  </div>
                  <span className="text-sm font-medium">{suggestSolutions ? 'On' : 'Off'}</span>
                </label>
              </div>
            </div>
          )}

          {/* Confidence Threshold Slider */}
          {autoReplyEnabled && suggestSolutions && (
            <div className="pt-2 space-y-2 border-t">
              <div className="flex justify-between items-center">
                <label htmlFor="highConfidenceThreshold" className="text-sm font-medium">
                  Auto-Send Confidence Threshold
                </label>
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium text-primary">
                    {Math.round(tempThreshold * 100)}%
                  </span>
                  {thresholdSaved && (
                    <span className="text-xs text-green-600 dark:text-green-400 animate-fade-in">
                      ✓ Saved
                    </span>
                  )}
                </div>
              </div>
              <input
                type="range"
                min="70"
                max="100"
                step="5"
                value={Math.round(tempThreshold * 100)}
                onChange={(event) => onThresholdChange(Number(event.target.value) / 100)}
                onMouseUp={onThresholdSave}
                onTouchEnd={onThresholdSave}
                disabled={savingAutoReply}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-primary"
              />
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  • <strong>≥{Math.round(tempThreshold * 100)}%:</strong> Auto-send email
                  immediately ✨
                </p>
                <p>
                  • <strong>70-{Math.round(tempThreshold * 100) - 1}%:</strong> Suggest answer
                  for agent review
                </p>
                <p>
                  • <strong>&lt;70%:</strong> Skip (not confident enough)
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {autoReplyEnabled ? (
              <>
                AI{' '}
                {requestMissingInfo &&
                  suggestSolutions &&
                  'requests missing details and suggests solutions'}
                {requestMissingInfo && !suggestSolutions && 'requests missing details only'}
                {!requestMissingInfo && suggestSolutions && 'suggests solutions only'}
                {!requestMissingInfo &&
                  !suggestSolutions &&
                  'is enabled but no behaviors are active'}
                . Max 1 AI reply per thread before human escalation.
              </>
            ) : (
              'AI auto-reply is currently disabled. All messages will require manual handling by support agents.'
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
