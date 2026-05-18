import { useState } from 'react';
import { Wifi, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';

export const WebSocketStatus = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { socket } = useEmailProcessing(false); // Don't subscribe to events, just get socket
  const isConnected = socket?.connected ?? false;
  const socketId = socket?.id ?? 'N/A';

  return (
    <>
      {/* Compact Button */}
      {/* {!isExpanded && (
        <Button
          onClick={() => setIsExpanded(true)}
          className={`fixed right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg shadow-lg transition-all z-50 group ${
            isConnected
              ? 'text-white bg-green-600 hover:bg-green-700'
              : 'text-white bg-red-600 hover:bg-red-700'
          }`}
          title={isConnected ? 'Connected' : 'Disconnected'}
        >
          {isConnected ? (
            <Wifi className="w-4 h-4 animate-pulse" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
          <span className="absolute right-full px-2 py-1 mr-2 text-xs text-white whitespace-nowrap bg-gray-900 rounded opacity-0 transition-opacity pointer-events-none group-hover:opacity-100">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </Button>
      )} */}

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="fixed right-0 top-1/2 z-50 w-64 -translate-y-1/2">
          <div
            className={`shadow-xl rounded-l-lg overflow-hidden ${
              isConnected ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 text-white">
              <div className="flex gap-2 items-center">
                {isConnected ? (
                  <Wifi className="w-5 h-5 animate-pulse" />
                ) : (
                  <WifiOff className="w-5 h-5" />
                )}
                <span className="font-semibold">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
                className="p-1 h-auto text-white rounded transition-colors hover:bg-white/20 hover:text-white"
                title="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-2 text-xs bg-white">
              <div className="flex justify-between">
                <span className="font-medium text-gray-600">Status:</span>
                <span
                  className={`font-mono font-semibold ${
                    isConnected ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {isConnected ? 'Live ✅' : 'Offline ❌'}
                </span>
              </div>

              {isConnected && (
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Socket ID:</span>
                  <span className="ml-2 font-mono text-xs truncate" title={socketId}>
                    {socketId.substring(0, 12)}...
                  </span>
                </div>
              )}

              <div className="pt-2 text-xs text-gray-500 border-t">
                {isConnected ? <>Real-time updates active</> : <>Reconnecting...</>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
