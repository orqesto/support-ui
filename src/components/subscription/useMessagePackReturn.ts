import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from '@/lib/toast';

/**
 * Stripe sends the customer back to /subscription after a message-pack checkout with
 * `?status=pack_success|pack_cancelled` (the backend's success/cancel URLs). Say what
 * happened once, then drop the flag so a reload does not repeat it.
 */
export const useMessagePackReturn = (): void => {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status');

  useEffect(() => {
    if (status !== 'pack_success' && status !== 'pack_cancelled') return;
    if (status === 'pack_success') {
      toast.success(
        'Message pack purchased. The extra messages are added to this period as soon as Stripe confirms the payment — usually within a few seconds.'
      );
    } else {
      toast.info('Message pack checkout cancelled — nothing was charged.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [status, searchParams, setSearchParams]);
};
