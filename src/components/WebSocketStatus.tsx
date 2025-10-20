import { useState } from 'react';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { Wifi, WifiOff, X } from 'lucide-react';

export const WebSocketStatus = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { socket } = useEmailProcessing();
  const isConnected = socket?.connected ?? false;
  const socketId = socket?.id || 'N/A';

  return (
    <>
      {/* Compact Button */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className={`fixed right-0 top-1/2 -translate-y-1/2 p-2 rounded-l-lg shadow-lg transition-all z-50 group ${
            isConnected
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
          title={isConnected ? 'Connected' : 'Disconnected'}
        >
          {isConnected ? (
            <Wifi className="h-5 w-5 animate-pulse" />
          ) : (
            <WifiOff className="h-5 w-5" />
          )}
          <span className="absolute right-full mr-2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </button>
      )}

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50 w-64">
          <div className={`shadow-xl rounded-l-lg overflow-hidden ${
            isConnected ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {/* Header */}
            <div className="px-4 py-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi className="h-5 w-5 animate-pulse" />
                ) : (
                  <WifiOff className="h-5 w-5" />
                )}
                <span className="font-semibold">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="hover:bg-white/20 p-1 rounded transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="bg-white p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600 font-medium">Status:</span>
                <span className={`font-mono font-semibold ${
                  isConnected ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isConnected ? 'Live ✅' : 'Offline ❌'}
                </span>
              </div>
              
              {isConnected && (
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Socket ID:</span>
                  <span className="font-mono text-xs truncate ml-2" title={socketId}>
                    {socketId.substring(0, 12)}...
                  </span>
                </div>
              )}

              <div className="pt-2 border-t text-gray-500 text-xs">
                {isConnected ? (
                  <>Real-time updates active</>
                ) : (
                  <>Reconnecting...</>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
