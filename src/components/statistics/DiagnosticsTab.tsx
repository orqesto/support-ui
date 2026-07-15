import { Brain, Cpu, BarChart3, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { StatisticsData } from '@/services/statistics.service';

interface Props {
  stats: StatisticsData;
}

/**
 * Diagnostics — AI/model internals split out of the customer-facing Overview.
 * Admin-only (gated in StatisticsPage). Shows which providers/models ran, the
 * message-processing funnel, and category-prediction accuracy.
 */
export function DiagnosticsTab({ stats }: Props) {
  const hasModelData =
    stats.aiModels && (stats.aiModels.totalAnalyzed > 0 || stats.aiModels.totalEmbedded > 0);

  return (
    <div id="panel-diagnostics" role="tabpanel" className="space-y-6 pt-4">
      <div>
        <h2 className="text-lg font-semibold">AI &amp; Model Diagnostics</h2>
        <p className="text-sm text-muted-foreground">
          Provider/model breakdowns and prediction accuracy for the AI pipeline. Visible to
          administrators only.
        </p>
      </div>

      {!hasModelData ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No AI processing data available for this window.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span className="flex gap-2 items-center">
                <Brain className="w-5 h-5" />
                AI Models Usage
              </span>
              <span className="text-xs font-normal text-muted-foreground">All time</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 mb-6 rounded-lg bg-muted/50">
              <h3 className="mb-3 text-sm font-semibold">Message Processing Breakdown</h3>
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <div><div className="text-2xl font-bold">{stats.aiModels.totalMessages}</div><div className="text-xs text-muted-foreground">Total Messages</div></div>
                <div><div className="text-2xl font-bold text-red-600">{stats.aiModels.totalSpam}</div><div className="text-xs text-muted-foreground">Spam Filtered ({stats.aiModels.totalMessages > 0 ? Math.round((stats.aiModels.totalSpam / stats.aiModels.totalMessages) * 100) : 0}%)</div></div>
                <div><div className="text-2xl font-bold text-orange-600">{stats.aiModels.totalUnprocessed}</div><div className="text-xs text-muted-foreground">Unprocessed ({stats.aiModels.totalMessages > 0 ? Math.round((stats.aiModels.totalUnprocessed / stats.aiModels.totalMessages) * 100) : 0}%)</div></div>
                <div><div className="text-2xl font-bold text-green-600">{stats.aiModels.totalAnalyzed}</div><div className="text-xs text-muted-foreground">AI Analyzed ({stats.aiModels.totalMessages > 0 ? Math.round((stats.aiModels.totalAnalyzed / stats.aiModels.totalMessages) * 100) : 0}%)</div></div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground"><Lightbulb className="inline h-4 w-4 text-muted-foreground mr-1" />Only messages that pass spam filtering and are marked as processed go through AI analysis</div>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {stats.aiModels.analysisProviders.length > 0 && (
                <div>
                  <div className="flex gap-2 items-center mb-3"><Cpu className="w-4 h-4 text-purple-600" /><h3 className="text-sm font-semibold">Analysis Providers</h3><span className="text-xs text-muted-foreground">({stats.aiModels.totalAnalyzed} messages)</span></div>
                  <div className="space-y-2">{stats.aiModels.analysisProviders.map((item) => (<div key={item.provider} className="flex justify-between items-center"><span className="text-sm capitalize">{item.provider}</span><div className="flex gap-2 items-center"><span className="text-sm font-medium">{item.count}</span><span className="text-xs text-muted-foreground">({item.percentage}%)</span></div></div>))}</div>
                </div>
              )}
              {stats.aiModels.embeddingProviders.length > 0 && (
                <div>
                  <div className="flex gap-2 items-center mb-3"><Cpu className="w-4 h-4 text-blue-600" /><h3 className="text-sm font-semibold">Embedding Providers</h3><span className="text-xs text-muted-foreground">({stats.aiModels.totalEmbedded} messages)</span></div>
                  <div className="space-y-2">{stats.aiModels.embeddingProviders.map((item) => (<div key={item.provider} className="flex justify-between items-center"><span className="text-sm capitalize">{item.provider}</span><div className="flex gap-2 items-center"><span className="text-sm font-medium">{item.count}</span><span className="text-xs text-muted-foreground">({item.percentage}%)</span></div></div>))}</div>
                </div>
              )}
              {stats.aiModels.analysisModels.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Analysis Models</h3>
                  <div className="space-y-2">{stats.aiModels.analysisModels.map((item) => (<div key={item.model} className="flex justify-between items-center text-xs"><span className="font-mono">{item.model}</span><div className="flex gap-2 items-center"><span className="font-medium">{item.count}</span><span className="text-muted-foreground">({item.percentage}%)</span></div></div>))}</div>
                </div>
              )}
              {stats.aiModels.embeddingModels.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Embedding Models</h3>
                  <div className="space-y-2">{stats.aiModels.embeddingModels.map((item) => (<div key={item.model} className="flex justify-between items-center text-xs"><span className="font-mono">{item.model}</span><div className="flex gap-2 items-center"><span className="font-medium">{item.count}</span><span className="text-muted-foreground">({item.percentage}%)</span></div></div>))}</div>
                </div>
              )}
            </div>
            {stats.aiAccuracy && stats.aiAccuracy.length > 0 && (() => {
              const totalPredictions = stats.aiAccuracy.reduce((sum, item) => sum + item.count, 0);
              const correctPredictions = stats.aiAccuracy.filter((item) => item.suggestedCategoryName === item.actualCategoryName).reduce((sum, item) => sum + item.count, 0);
              const accuracyRate = totalPredictions > 0 ? Math.round((correctPredictions / totalPredictions) * 100) : 0;
              return (
                <div className="pt-6 mt-6 border-t">
                  <div className="flex gap-2 items-center mb-4"><BarChart3 className="w-4 h-4 text-purple-600" /><h3 className="text-sm font-semibold">Category Prediction Accuracy</h3><span className="px-3 py-1 ml-auto text-sm font-semibold text-purple-600 rounded-full bg-purple-500/10 dark:text-purple-400">{accuracyRate}% Match Rate</span></div>
                  <div className="p-3 mb-4 rounded-lg bg-muted/50"><div className="grid grid-cols-3 gap-4 text-center"><div><div className="text-lg font-bold">{totalPredictions}</div><div className="text-xs text-muted-foreground">Total Predictions</div></div><div><div className="text-lg font-bold text-green-600">{correctPredictions}</div><div className="text-xs text-muted-foreground">Correct</div></div><div><div className="text-lg font-bold text-orange-600">{totalPredictions - correctPredictions}</div><div className="text-xs text-muted-foreground">Human Adjusted</div></div></div></div>
                  <div className="overflow-y-auto space-y-2 max-h-64">
                    {stats.aiAccuracy.sort((itemA, itemB) => itemB.count - itemA.count).slice(0, 15).map((item, index) => {
                      const isMatch = item.suggestedCategoryName === item.actualCategoryName;
                      return (
                        <div
                          // eslint-disable-next-line react/no-array-index-key
                          key={`${item.suggestedCategoryName}-${item.actualCategoryName}-${index}`}
                          className="flex justify-between items-center p-2 text-xs rounded transition-colors hover:bg-muted/50"
                        >
                          <div className="flex flex-1 gap-2 items-center min-w-0">
                            {isMatch ? (
                              <div className="flex gap-1 items-center min-w-0"><span className="flex flex-shrink-0 justify-center items-center w-4 h-4 text-green-600 rounded-full bg-green-500/10 dark:text-green-400">✓</span><span className="font-medium text-green-600 truncate dark:text-green-400">{item.suggestedCategoryName}</span></div>
                            ) : (
                              <div className="flex gap-1 items-center min-w-0"><span className="flex flex-shrink-0 justify-center items-center w-4 h-4 text-orange-600 rounded-full bg-orange-500/10 dark:text-orange-400">✎</span><span className="truncate text-muted-foreground">{item.suggestedCategoryName}</span><span className="flex-shrink-0 text-muted-foreground">→</span><span className="font-medium truncate">{item.actualCategoryName}</span></div>
                            )}
                          </div>
                          <span className="flex-shrink-0 ml-2 font-medium text-muted-foreground">{item.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
