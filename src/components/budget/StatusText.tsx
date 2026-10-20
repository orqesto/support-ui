import { cn } from '@/lib/utils';
import type { StatusLine } from '@/services/budgets.service';

export type Tone = StatusLine['tone'];

export const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
};

/** A status line from the API, shown as is (the components never compute it). */
export const StatusText = ({
  tone,
  text,
  testId,
}: {
  tone: Tone;
  text: string;
  testId?: string;
}) => (
  <p data-testid={testId} data-tone={tone} className={cn('text-sm font-medium', TONE_CLASS[tone])}>
    {text}
  </p>
);
