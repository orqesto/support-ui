import { Button } from '@/components/ui/Button';
import { VAT_NOTE, formatMoney } from '@/lib/money';
import type { MessagePackOffer } from '@/services/subscription.service';

/**
 * The second door out of the message cap (the first is a plan upgrade): a one-time pack
 * credited to the CURRENT period, expiring with it (owner decision 2026-09-04). Rendered
 * whenever the backend says a pack can be bought — not only at the cap, because buying
 * ahead of a busy week is the point. Renders nothing when the backend refuses (free
 * plan, trial, lapsed, no cap): for those the upgrade door is the only one.
 */
export const MessagePackOfferCard = ({
  offer,
  onBuy,
  buying,
}: {
  offer: MessagePackOffer | undefined;
  onBuy: () => void;
  buying: boolean;
}) => {
  if (!offer?.available) return null;

  return (
    <div className="flex flex-wrap gap-3 justify-between items-center p-4 mt-4 rounded-lg border bg-muted/40">
      <div>
        <p className="font-medium">Need more messages this period?</p>
        <p className="text-sm text-muted-foreground">
          Add {offer.messages.toLocaleString()} messages for{' '}
          {formatMoney(offer.priceCents, offer.currency)} {VAT_NOTE}, one-time. They are added to
          this period and expire with it.
        </p>
      </div>
      <Button variant="outline" onClick={onBuy} isLoading={buying} data-testid="buy-message-pack">
        Buy {offer.messages.toLocaleString()} messages
      </Button>
    </div>
  );
};
