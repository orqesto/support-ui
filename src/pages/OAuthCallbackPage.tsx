import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/Button';

export const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing OAuth callback...');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(`OAuth error: ${error}`);
      return;
    }

    if (code) {
      try {
        // Check if opened in popup (has window.opener) or new tab
        const opener = window.opener as (Window & { closed: boolean }) | null;
        if (opener && !opener.closed) {
          // Popup case: Use postMessage to communicate with parent
          logger.info('📤 Sending code to parent window via postMessage');
          opener.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code }, window.location.origin);
        } else {
          // New tab case: Use localStorage as fallback
          logger.info('📤 Storing code in localStorage (new tab)');
          localStorage.setItem('gmail_oauth_code', code);
        }

        setStatus('success');
        setMessage('Authorization successful! This window will close automatically.');

        // Auto-close after 1 second
        setTimeout(() => {
          window.close();
        }, 1000);
      } catch (e) {
        logger.error('Failed to communicate OAuth code:', e);
        setStatus('error');
        setMessage('Failed to save authorization code. Please try again.');
      }
    } else {
      setStatus('error');
      setMessage('No authorization code received.');
    }
  }, [searchParams]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <div className="p-8 w-full max-w-md bg-white rounded-lg shadow-lg">
        {status === 'processing' && (
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full border-4 border-blue-600 animate-spin border-t-transparent" />
            <p className="mt-4 text-lg font-medium text-gray-700">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="flex justify-center items-center mx-auto w-16 h-16 bg-green-100 rounded-full">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="mt-4 text-lg font-medium text-gray-700">{message}</p>
            <p className="mt-2 text-sm text-gray-500">This window will close automatically.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="flex justify-center items-center mx-auto w-16 h-16 bg-red-100 rounded-full">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="mt-4 text-lg font-medium text-red-600">{message}</p>
            <Button
              onClick={() => window.close()}
              className="px-4 py-2 mt-4 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              Close Window
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
