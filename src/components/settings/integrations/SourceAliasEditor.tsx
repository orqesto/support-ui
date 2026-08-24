/**
 * Which addresses does this mailbox answer to?
 *
 * A source is configured with ONE address, but a mailbox routinely takes delivery
 * on several — a shop with per-country storefronts receives on `.co.uk`, `.de`,
 * `.es` and more, all landing in the same inbox. Until now nothing in the product
 * could show that, and nothing could record it: aliases were editable only by a
 * hand-written PATCH from a browser console, which meant a customer could never
 * manage their own mailbox.
 *
 * ⚠️ ADOPTING AN ADDRESS IS NOT COSMETIC. The declared set is what direction
 * detection uses to decide "is this message ours". Adopt a cc'd colleague or a
 * supplier and mail FROM that person becomes our own outgoing — and outgoing mail
 * with no recoverable correspondent is filed as a hidden orphan and leaves the
 * inbox. So: nothing is pre-selected, every row shows the volume and recency
 * behind it, and the coverage line says how much of the archive the list rests on.
 */

import { useCallback, useEffect, useState } from 'react';
import { AtSign, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { logger } from '@/lib/logger';
import { integrationsService } from '@/services/integrations.service';
import { messageService, type ReceivedAddressRow } from '@/services/message.service';


/**
 * Read the declared aliases off a source config without asserting its shape.
 *
 * `Integration` is a union whose `config` differs per type, so reaching straight
 * for `.aliases` resolves to an error type at the call site. Narrowing here also
 * means a backend that omits the field, or sends something that is not a list of
 * strings, degrades to "none declared" rather than crashing the settings page.
 */
export const declaredAliases = (config: unknown): string[] => {
  const raw = (config as { aliases?: unknown } | null | undefined)?.aliases;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
};

type Props = {
  sourceId: number;
  sourceType: string;
  /** Addresses already declared on this source's config. */
  declared: string[];
  onClose: () => void;
  onSaved: () => void;
};

const formatLastSeen = (value: string | null): string => {
  if (!value) return 'never';
  const seen = new Date(value);
  if (Number.isNaN(seen.getTime())) return 'unknown';
  return seen.toLocaleDateString();
};

export const SourceAliasEditor = ({
  sourceId,
  sourceType,
  declared,
  onClose,
  onSaved,
}: Props) => {
  const [rows, setRows] = useState<ReceivedAddressRow[] | null>(null);
  const [coverage, setCoverage] = useState<{ conversations: number; withDeliveryAddress: number }>({
    conversations: 0,
    withDeliveryAddress: 0,
  });
  /** null = the backend cannot answer (route absent), which is not "no addresses". */
  const [unavailable, setUnavailable] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      const result = await messageService.getReceivedAddresses();
      if (ignore) return;
      if (!result) {
        setUnavailable(true);
      } else {
        setRows(result.addresses);
        setCoverage(result.coverage);
      }
      // Seeded from what is already declared, never from what was merely observed.
      setSelected(declared.map((address) => address.toLowerCase()));
      setLoading(false);
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [declared]);

  const toggle = useCallback((address: string) => {
    setSelected((current) =>
      current.includes(address)
        ? current.filter((entry) => entry !== address)
        : [...current, address]
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // `type` is required or the API 400s: ids repeat across message_sources and
      // ai_providers, so the type is what disambiguates which table to update.
      // The aliases array REPLACES wholesale — send the full intended set.
      await integrationsService.update(sourceId, {
        type: sourceType,
        config: { aliases: selected },
      });
      onSaved();
    } catch (err) {
      logger.error('Failed to save mailbox aliases:', err);
    } finally {
      setSaving(false);
    }
  };

  const thinCoverage =
    coverage.conversations > 0 && coverage.withDeliveryAddress < coverage.conversations;

  return (
    <div className="mt-2 p-3 rounded-lg border bg-muted/30">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium flex items-center gap-1">
          <AtSign className="w-3.5 h-3.5" /> Addresses this mailbox receives on
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          className="p-0 w-auto h-auto text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {loading && (
        <div className="flex gap-2 items-center py-2 text-sm text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading delivery history…
        </div>
      )}

      {!loading && unavailable && (
        <p className="py-2 text-xs text-muted-foreground">
          This workspace&apos;s backend cannot list delivery addresses yet. Aliases already
          declared on this mailbox keep working — they simply cannot be edited here until it
          is updated.
        </p>
      )}

      {!loading && !unavailable && rows?.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">
          No delivery addresses recorded yet. Mail received from now on will be listed here.
        </p>
      )}

      {!loading && !unavailable && rows && rows.length > 0 && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Turn on the addresses that belong to this mailbox. Replies your team sends from
            them will then be recognised as yours instead of appearing as new customer mail.
            Leave anything you do not recognise switched off.
          </p>

          <div className="flex flex-col gap-1.5">
            {rows.map((row) => {
              const attachedElsewhere =
                row.attachedToSourceId !== null && row.attachedToSourceId !== sourceId;
              return (
                <div
                  key={row.address}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border/60 bg-background"
                >
                  <div className="min-w-0">
                    <div className="flex gap-1.5 items-center">
                      <span className="text-xs truncate">{row.address}</span>
                      {row.configured && (
                        <Badge variant="secondary" className="text-[10px]">
                          configured
                        </Badge>
                      )}
                      {attachedElsewhere && (
                        <Badge variant="warning" className="text-[10px]">
                          another mailbox
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {row.conversations} conversation{row.conversations === 1 ? '' : 's'} · last{' '}
                      {formatLastSeen(row.lastSeenAt)}
                    </span>
                  </div>
                  <Toggle
                    checked={row.configured || selected.includes(row.address)}
                    // The configured address is ours by definition and cannot be
                    // un-declared here; switching it off would only mislead.
                    disabled={row.configured || attachedElsewhere || saving}
                    onChange={() => toggle(row.address)}
                    label={`Treat ${row.address} as this mailbox`}
                  />
                </div>
              );
            })}
          </div>

          {thinCoverage && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Based on {coverage.withDeliveryAddress} of {coverage.conversations} conversations
              — older mail was stored before delivery addresses were recorded, so an address
              used only in the past may be missing from this list.
            </p>
          )}
        </>
      )}

      {!loading && (
        <div className="flex gap-2 justify-end mt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || unavailable}
          >
            {saving && <Loader2 className="mr-1 w-3 h-3 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
};
