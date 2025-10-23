import { useState } from 'react';
import { Activity, X } from 'lucide-react';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';

export const WebSocketDebug = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { socket, status, total, current, processed, failed, isProcessing } =
    useEmailProcessing(false); // Disabled by default

  const connectionState = socket?.connected ? 'Connected ✅' : 'Disconnected ❌';
  const socketId = socket?.id || 'N/A';

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-r-lg shadow-lg transition-all z-50 group"
          title="Open WebSocket Debug"
        >
          <Activity className="h-5 w-5" />
          <span className="absolute left-full ml-2 bg-popover text-popover-foreground border border-border text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md">
            Debug Panel
          </span>
        </button>
      )}

      {/* Expandable Panel */}
      {isOpen && (
        <div className="fixed left-0 top-1/2 -translate-y-1/2 z-50 w-80">
          <Card className="shadow-xl">
            <CardHeader className="bg-blue-600 text-white">
              <CardTitle className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span>WebSocket Debug</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="hover:bg-blue-700 p-1 rounded transition-colors"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </CardTitle>
            </CardHeader>

            <CardContent className="text-xs space-y-2 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <div className="font-medium text-muted-foreground">Status:</div>
                <div className="font-mono">{connectionState}</div>

                <div className="font-medium text-muted-foreground">Socket ID:</div>
                <div className="font-mono truncate" title={socketId}>
                  {socketId}
                </div>

                <div className="font-medium text-muted-foreground">Processing:</div>
                <div className="font-mono">{isProcessing ? 'Yes 🔄' : 'No'}</div>

                <div className="font-medium text-muted-foreground">State:</div>
                <div className="font-mono">{status}</div>

                <div className="font-medium text-muted-foreground">Total:</div>
                <div className="font-mono">{total}</div>

                <div className="font-medium text-muted-foreground">Current:</div>
                <div className="font-mono">{current}</div>

                <div className="font-medium text-muted-foreground">Processed:</div>
                <div className="font-mono text-green-600 dark:text-green-400">{processed}</div>

                <div className="font-medium text-muted-foreground">Failed:</div>
                <div className="font-mono text-red-600 dark:text-red-400">{failed}</div>
              </div>

              <div className="pt-2 border-t border-border">
                <div className="font-medium text-muted-foreground mb-1">Events:</div>
                <div className="bg-muted p-2 rounded text-xs font-mono h-32 overflow-y-auto">
                  Open browser console to see WebSocket events:
                  <br />
                  • ✅ WebSocket connected
                  <br />
                  • ❌ WebSocket disconnected
                  <br />
                  • 📧 Email processing event
                  <br />
                  • 💾 Caching page
                  <br />• ✅ Cache HIT/MISS
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};
