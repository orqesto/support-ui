import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { apiErrorMessage } from '@/lib/apiError';
import maintenanceService, { type TrustedAddressesState } from '@/services/maintenance.service';

/**
 * Console → Maintenance: office addresses that skip the request limits (2026-10-27, after a whole
 * office behind one address hit the per-address limit). One address or range per line; the
 * backend validates each and answers 400 naming the problem. Login, 2FA and password-reset limits
 * still apply to these addresses.
 */

/** One entry per line or comma; blanks dropped, repeats kept once. */
export const parseTrustedEntries = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
  ),
];

export const TrustedAddressesCard = ({
  state,
  queryKey,
}: {
  state: TrustedAddressesState;
  queryKey: readonly unknown[];
}) => {
  const queryClient = useQueryClient();
  const [text, setText] = useState(state.entries.join('\n'));
  const entries = parseTrustedEntries(text);
  const dirty = entries.join('\n') !== state.entries.join('\n');
  const own = state.yourAddress;
  const ownListed = own !== null && entries.includes(own);

  const save = useMutation({
    mutationFn: (next: string[]) => maintenanceService.setTrustedAddresses(next),
    onSuccess: (saved) => {
      setText(saved.join('\n'));
      toast.success('Trusted addresses saved — they take effect within a minute');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save the trusted addresses.')),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <ShieldCheck className="w-5 h-5 text-muted-foreground" />
          Trusted addresses
        </CardTitle>
        <CardDescription>
          Requests from these addresses are never slowed down by the request limits — use it for an
          office where the whole team shares one internet address. Sign-in, two-factor and
          password-reset limits still apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.selfHosted && (
          <Alert variant="info">
            This server is self-hosted, so the request limits are already off for everyone. The list
            below changes nothing here.
          </Alert>
        )}
        <Textarea
          label="One address or range per line"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder={'203.0.113.10\n198.51.100.0/24'}
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-3 items-center">
          <Button onClick={() => save.mutate(entries)} disabled={!dirty || save.isPending}>
            Save
          </Button>
          {own !== null && !ownListed && (
            <Button
              variant="outline"
              onClick={() => setText([...entries, own].join('\n'))}
              disabled={save.isPending}
            >
              Add my address ({own})
            </Button>
          )}
          {own !== null && ownListed && (
            <span className="text-sm text-muted-foreground">Your address ({own}) is listed.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
