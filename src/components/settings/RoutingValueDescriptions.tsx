import { useEffect, useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { aiRefusalText } from './routingCopy';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Textarea';
import { organizationService } from '@/services/organization.service';
import type { RoutingKeyType, RoutingValue } from '@/types/skillRouting';

/**
 * A routing key's values and what each one matches (BE spec 2026-11-02 skill routing §6.8).
 * The description is shared by every agent holding the value and drives keyword, embedding and
 * AI matching — workspace admins only (this page is admin-only). `null` from the service means the
 * backend predates descriptions: nothing is rendered.
 */
export const RoutingValueDescriptions = ({
  routingKey,
  keyType,
}: {
  routingKey: string;
  keyType: RoutingKeyType;
}) => {
  const [values, setValues] = useState<RoutingValue[] | null | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    const rows = await organizationService
      .getRoutingKeyValues(routingKey, { includeReassigned: true })
      .catch(() => null);
    setValues(rows);
    if (rows) setDrafts(Object.fromEntries(rows.map((row) => [row.value, row.description ?? ''])));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingKey]);

  if (values === undefined || values === null) return null;
  if (values.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        No values yet — add skills for this key to agents in their profile.
      </p>
    );
  }

  const save = async (value: string) => {
    setBusy(value);
    try {
      const text = drafts[value]?.trim() ?? '';
      await organizationService.setRoutingValueDescription(routingKey, value, text || null);
      setNotice((current) => ({ ...current, [value]: 'Saved.' }));
    } catch {
      setNotice((current) => ({ ...current, [value]: 'Could not save. Try again.' }));
    } finally {
      setBusy(null);
    }
  };

  const suggest = async (value: string) => {
    setBusy(value);
    try {
      const result = await organizationService.suggestRoutingValueDescription(routingKey, value);
      if ('refused' in result) {
        setNotice((current) => ({ ...current, [value]: aiRefusalText(result.refused) }));
      } else {
        setDrafts((current) => ({ ...current, [value]: result.description }));
        setNotice((current) => ({ ...current, [value]: 'Draft from AI — check it, then Save.' }));
      }
    } catch {
      setNotice((current) => ({ ...current, [value]: aiRefusalText('failed') }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const value = deleting;
    setDeleting(null);
    try {
      await organizationService.deleteRoutingValue(routingKey, value);
      await load();
    } catch {
      setNotice((current) => ({ ...current, [value]: 'Could not delete. Try again.' }));
    }
  };

  return (
    <ul className="divide-y divide-border">
      {values.map((row) => (
        <li key={row.value} className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{row.value}</span>
            <Badge variant="secondary">
              {row.holders} {row.holders === 1 ? 'agent' : 'agents'}
            </Badge>
            {row.unused && <Badge variant="warning">Unused</Badge>}
            {(row.reassigned30d ?? 0) > 0 && (
              <Badge variant="danger">{row.reassigned30d} reassigned in 30 days</Badge>
            )}
            {keyType === 'language' && row.knownLanguage === false && (
              <Badge variant="warning">Not a known language — matches by keyword only</Badge>
            )}
          </div>
          <Textarea
            aria-label={`Description for ${row.value}`}
            value={drafts[row.value] ?? ''}
            onChange={(event) =>
              setDrafts((current) => ({ ...current, [row.value]: event.target.value }))
            }
            rows={2}
            maxLength={1000}
            placeholder="Which messages belong here. Short phrases (up to 4 words) separated by commas count as keywords, e.g. USD Coin, Circle, crypto"
          />
          {row.terms && row.terms.length > 0 && (
            <p className="text-xs text-muted-foreground">Matches: {row.terms.join(', ')}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              aria-label={`Save ${row.value}`}
              isLoading={busy === row.value}
              disabled={busy !== null}
              onClick={() => void save(row.value)}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Suggest ${row.value}`}
              disabled={busy !== null}
              onClick={() => void suggest(row.value)}
            >
              <Sparkles className="mr-1 h-4 w-4" />
              Suggest
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${row.value}`}
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleting(row.value)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {notice[row.value] && (
              <span className="text-xs text-muted-foreground">{notice[row.value]}</span>
            )}
          </div>
        </li>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onConfirm={() => void remove()}
        title="Delete value"
        description={
          deleting
            ? `Delete "${deleting}"? It is removed from every agent who has it, with its description.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
      />
    </ul>
  );
};
