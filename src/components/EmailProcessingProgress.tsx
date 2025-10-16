import { useEmailProcessing } from '../hooks/useEmailProcessing';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export const EmailProcessingProgress = () => {
  const {
    status,
    total,
    current,
    processed,
    failed,
    error,
    progress,
    isProcessing,
  } = useEmailProcessing();

  if (status === 'idle') {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : status === 'complete' ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          Email Processing {isProcessing ? 'In Progress' : status === 'complete' ? 'Complete' : 'Failed'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Progress Bar */}
          {total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Processing: {current} / {total}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Messages */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1">
                <Mail className="h-4 w-4 text-blue-500" />
                <span className="text-2xl font-bold">{total}</span>
              </div>
              <p className="text-xs text-muted-foreground">Found</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-2xl font-bold">{processed}</span>
              </div>
              <p className="text-xs text-muted-foreground">Processed</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-2xl font-bold">{failed}</span>
              </div>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {status === 'complete' && !error && (
            <div className="bg-green-50 text-green-700 px-4 py-2 rounded text-sm">
              ✅ Successfully processed {processed} email{processed !== 1 ? 's' : ''}
              {failed > 0 && ` (${failed} failed)`}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
