import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PAST_DUE_TEXT, PAST_DUE_AGENT_TEXT } from './cancelCopy';

/** A failed renewal on the Subscription page (audit B8): who can pay updates the payment method. */
export const PastDueCard = ({
  canManage,
  loading,
  onUpdatePayment,
}: {
  canManage: boolean;
  loading: boolean;
  onUpdatePayment: () => void;
}) => (
  <Card className="border-warning/50" data-testid="past-due-card">
    <CardContent className="flex flex-wrap gap-3 justify-between items-center p-4">
      <div className="flex gap-3 items-start">
        <AlertTriangle className="mt-0.5 w-5 h-5 text-warning" />
        <p className="font-medium">{canManage ? PAST_DUE_TEXT : PAST_DUE_AGENT_TEXT}</p>
      </div>
      {canManage && (
        <Button variant="secondary" isLoading={loading} onClick={onUpdatePayment}>
          Update payment method
        </Button>
      )}
    </CardContent>
  </Card>
);
