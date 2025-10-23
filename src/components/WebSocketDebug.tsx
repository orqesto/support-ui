import { useState } from 'react';
import { Activity, X } from 'lucide-react';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';

export const WebSocketDebug = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { socket, status, total, current, processed, failed, isProcessing } =
    useEmailProcessing(false); // Disabled by default

  const connectionState = socket?.connected ? 'Connected ✅' : 'Disconnected ❌';
  const socketId = socket?.id ?? 'N/A';

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed left-0 top-1/2 z-50 p-2 text-white bg-blue-600 rounded-r-lg shadow-lg transition-all -translate-y-1/2 hover:bg-blue-700 group"
          title="Open WebSocket Debug"
        >
          <Activity className="w-5 h-5" />
          <span className="absolute left-full px-2 py-1 ml-2 text-xs whitespace-nowrap rounded border shadow-md opacity-0 transition-opacity pointer-events-none bg-popover text-popover-foreground border-border group-hover:opacity-100">
            Debug Panel
          </span>
        </Button>
      )}

      {/* Expandable Panel */}
      {isOpen && (
        <div className="fixed left-0 top-1/2 z-50 w-80 -translate-y-1/2">
          <Card className="shadow-xl">
            <CardHeader className="text-white bg-blue-600">
              <CardTitle className="flex justify-between items-center text-sm">
                <div className="flex gap-2 items-center">
                  <Activity className="w-4 h-4" />
                  <span>WebSocket Debug</span>
                </div>
                <Button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded transition-colors hover:bg-blue-700"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>

            <CardContent className="overflow-y-auto space-y-2 max-h-96 text-xs">
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
                <div className="mb-1 font-medium text-muted-foreground">Events:</div>
                <div className="overflow-y-auto p-2 h-32 font-mono text-xs rounded bg-muted">
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
