import { useState } from 'react';
import { BarSegment, BarSlider } from '@/components/ui/BarSlider';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { EXTRA_MAX, EXTRA_MIN, MILLION, fmt, usd } from './budget.rules';
import { FieldLabel } from './BulkLimitField';

/**
 * An organisation or workspace admin asks the platform admin for extra bulk-work tokens. Nothing
 * is granted here: the request goes to the platform admin's list. Shared by the organisation
 * console (a target choice: the whole organisation or one workspace) and the workspace settings
 * (no target choice: its own workspace).
 */

export type RequestTarget = {
  /** null = the whole organisation. */
  organizationId: number | null;
  label: string;
  /** Tokens: where the amount starts for this target. */
  suggestion?: number;
};

export type RequestExtraBoxProps = {
  title?: string;
  /** More than one ⇒ a "For" choice is shown. Omit for a fixed target. */
  targets?: RequestTarget[];
  /** Tokens: the amount when no target suggestion applies. */
  initialAmount?: number;
  busy?: boolean;
  /** Answers whether it was sent: the reason box clears on `true`. */
  onRequest: (
    tokens: number,
    reason: string | undefined,
    organizationId: number | null
  ) => void | Promise<boolean>;
};

const ceil5 = (tokens: number) => Math.ceil(tokens / MILLION / 5) * 5;
const atLeastMin = (tokens: number) => Math.max(EXTRA_MIN * MILLION, tokens);

export const RequestExtraBox = ({
  title = 'Request extra for bulk work',
  targets,
  initialAmount = 10 * MILLION,
  busy,
  onRequest,
}: RequestExtraBoxProps) => {
  const [targetIndex, setTargetIndex] = useState(0);
  const target = targets?.[targetIndex];
  const startFor = (index: number) => atLeastMin(targets?.[index]?.suggestion ?? initialAmount);
  const [amountTokens, setAmountTokens] = useState(() => startFor(0));
  const [reason, setReason] = useState('');
  const amount = amountTokens / MILLION;
  // The slider reaches at least the largest suggestion / the amount shown, so it can be given exactly.
  const top = Math.max(
    EXTRA_MAX,
    ceil5(initialAmount),
    ceil5(amountTokens),
    ...(targets ?? []).map((item) => ceil5(item.suggestion ?? 0))
  );
  const selectId = 'request-extra-target';
  const reasonId = 'request-extra-reason';

  const send = () => {
    const trimmed = reason.trim();
    const result = onRequest(amountTokens, trimmed === '' ? undefined : trimmed, target?.organizationId ?? null);
    if (result)
      void result.then((ok) => {
        if (ok) setReason('');
      });
  };

  return (
    <div className="flex flex-col gap-1.5 max-w-md">
      <FieldLabel>{title}</FieldLabel>
      {targets && targets.length > 1 && (
        <Select
          id={selectId}
          label="For"
          value={String(targetIndex)}
          onChange={(next: string) => {
            const index = Number(next);
            setTargetIndex(index);
            setAmountTokens(startFor(index));
          }}
          options={targets.map((item, index) => ({ value: String(index), label: item.label }))}
        />
      )}
      <span className="font-mono text-lg">
        +{fmt(amount)} {usd(amount)}
      </span>
      <BarSlider
        value={amount}
        min={EXTRA_MIN}
        max={top}
        step={5}
        onChange={(millions) => setAmountTokens(millions * MILLION)}
        ariaLabel="Requested extra, million tokens"
        ariaValueText={`${fmt(amount)} tokens`}
      >
        <BarSegment width={(amount / top) * 100} className="bg-warning" />
      </BarSlider>
      <Textarea
        id={reasonId}
        label="Reason (optional)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        maxLength={500}
      />
      <div>
        <Button size="sm" disabled={busy} onClick={send}>
          Send request
        </Button>
      </div>
      <span className="text-sm text-muted-foreground">
        The platform admin decides. Extra covers bulk work only and ends on its own.
      </span>
    </div>
  );
};
