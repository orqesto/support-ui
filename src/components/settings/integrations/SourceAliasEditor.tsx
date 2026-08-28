/**
 * Which addresses does this mailbox answer to?
 *
 * A source is configured with ONE address, but a mailbox routinely takes delivery
 * on several — a shop with per-country storefronts receives on `.co.uk`, `.de`,
 * `.es` and more, all landing in the same inbox. Nothing in the product could show
 * that, and the only way to record it was a hand-written PATCH from a console.
 *
 * ⚠️ ADOPTING AN ADDRESS IS NOT COSMETIC. The declared set is what direction
 * detection uses to decide "is this message ours". Adopt a cc'd colleague or a
 * supplier and mail FROM that person becomes our own outgoing — and outgoing mail
 * with no recoverable correspondent is filed as a hidden orphan and leaves the
 * inbox. So nothing is ever pre-selected, and every row carries its evidence.
 *
 * 🔑 THREE SOURCES, because one is not enough. Delivery addresses come from
 * `recipients`, which can be entirely empty — it is only written from the release
 * that introduced it and the backfill needs host access. Sender-derived candidates
 * come from `requester_email`, which every thread has. And manual entry exists
 * because neither can surface an address the mailbox has not received on yet, and
 * the admin already knows their own addresses.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AtSign, Loader2, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { logger } from '@/lib/logger';
import { integrationsService } from '@/services/integrations.service';
import { messageService } from '@/services/message.service';

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

/** Where a candidate came from — shown, because the sources differ in strength. */
type Origin = 'delivery' | 'sender' | 'manual' | 'declared';

type Candidate = {
  address: string;
  origin: Origin;
  conversations: number;
  lastSeenAt: string | null;
  configured: boolean;
  attachedElsewhere: boolean;
  likelyOurs: boolean;
  /** Our own server's delivery stamp. The only signal here a correspondent cannot forge. */
  deliveredConversations: number;
};

const ORIGIN_LABEL: Record<Origin, string> = {
  delivery: 'received at',
  sender: 'seen as sender',
  manual: 'added by you',
  declared: 'declared',
};

const formatLastSeen = (value: string | null): string => {
  if (!value) return 'never';
  const seen = new Date(value);
  if (Number.isNaN(seen.getTime())) return 'unknown';
  return seen.toLocaleDateString();
};

const normalise = (value: string): string => value.trim().toLowerCase();

export const SourceAliasEditor = ({
  sourceId,
  sourceType,
  declared,
  onClose,
  onSaved,
}: Props) => {
  const [delivery, setDelivery] = useState<Candidate[]>([]);
  const [senders, setSenders] = useState<Candidate[]>([]);
  const [manual, setManual] = useState<Candidate[]>([]);
  const [coverage, setCoverage] = useState({ conversations: 0, withDeliveryAddress: 0 });
  /** The route is absent — which is not the same as "no addresses". */
  const [unavailable, setUnavailable] = useState(false);
  /** The read failed — which is not the same as the route being absent. */
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'volume' | 'address'>('volume');
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const result = await messageService.getReceivedAddresses();
        if (ignore) return;
        if (!result) {
          setUnavailable(true);
        } else {
          setDelivery(
            result.addresses.map((row) => ({
              address: row.address,
              origin: 'delivery' as const,
              conversations: row.conversations,
              lastSeenAt: row.lastSeenAt,
              configured: row.configured,
              attachedElsewhere:
                row.attachedToSourceId !== null && row.attachedToSourceId !== sourceId,
              // ⛔ This was hardcoded `false`, so a delivery row could never be badged or
              // sorted as likely ours — and delivery rows are the ones with real evidence
              // once a workspace has run the recipients backfill. The backend has scored
              // them all along; the panel was throwing the score away.
              likelyOurs: row.likelyOurs,
              deliveredConversations: row.deliveredConversations,
            }))
          );
          setSenders(
            result.senderCandidates.map((row) => ({
              address: row.address,
              origin: 'sender' as const,
              conversations: row.conversations,
              lastSeenAt: row.lastSeenAt,
              configured: false,
              attachedElsewhere: false,
              likelyOurs: row.likelyOurs,
              // A sender observation is not a delivery observation. Never 'unknown' — the
              // absence of a stamp is exactly what this number is supposed to say.
              deliveredConversations: 0,
            }))
          );
          setCoverage(result.coverage);
        }
      } catch (error) {
        if (ignore) return;
        // Manual entry needs no backend, so a failed read must not take the panel
        // down with it — but it must not pass for an absent capability either.
        logger.error('Could not read the addresses this mailbox receives on', error);
        setFailed(true);
      } finally {
        if (!ignore) {
          // Seeded from what is already declared, never from what was merely observed.
          setSelected(declared.map(normalise));
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [declared, sourceId]);

  const toggle = useCallback((address: string) => {
    setSelected((current) =>
      current.includes(address)
        ? current.filter((entry) => entry !== address)
        : [...current, address]
    );
  }, []);

  /**
   * Everything the admin can act on, de-duplicated across sources. Declared
   * addresses that neither list surfaced are added explicitly — otherwise an alias
   * already on the config would be invisible here and look like it had been dropped.
   */
  const candidates = useMemo<Candidate[]>(() => {
    const byAddress = new Map<string, Candidate>();
    for (const entry of [...delivery, ...senders, ...manual]) {
      if (!byAddress.has(entry.address)) byAddress.set(entry.address, entry);
    }
    for (const address of selected) {
      if (!byAddress.has(address)) {
        byAddress.set(address, {
          address,
          origin: 'declared',
          conversations: 0,
          lastSeenAt: null,
          configured: false,
          attachedElsewhere: false,
          likelyOurs: false,
          deliveredConversations: 0,
        });
      }
    }
    return [...byAddress.values()];
  }, [delivery, senders, manual, selected]);

  /**
   * Does anything actually suggest this address belongs to THIS mailbox?
   *
   * The panel used to render one flat list of delivery addresses AND frequent senders, each
   * with a toggle — so on a real workspace it offered 98 customers (`messages-noreply@
   * linkedin.com` among them) as candidate aliases beside the two real addresses, and flagged
   * none of them. Asking an admin to pick 2 out of 100 is not a list, it is a hazard: adopting
   * a customer's address makes their mail read as OUTGOING and they disappear from the inbox.
   *
   * So the default view is the rows carrying evidence, and everything else is one click away.
   * The sender list is not dropped — an UNDECLARED alias shows up as requester volume rather
   * than delivery data, which is exactly how the CoreSarms storefronts hid — but it stops
   * being the first thing an admin sees.
   *
   * ⛔ Same-domain is deliberately NOT evidence. A colleague's own mailbox at our company
   * (`zhanat.chokin@prefabhome.eu` beside `natalie.antonenko@prefabhome.eu`) is not an alias
   * of this mailbox, and declaring it would send their mail out of the inbox.
   */
  const hasEvidence = useCallback(
    (entry: Candidate) =>
      entry.configured ||
      entry.attachedElsewhere ||
      entry.origin === 'manual' ||
      entry.origin === 'declared' ||
      selected.includes(entry.address) ||
      entry.likelyOurs ||
      entry.deliveredConversations > 0,
    [selected]
  );

  const unevidencedCount = useMemo(
    () => candidates.filter((entry) => !hasEvidence(entry)).length,
    [candidates, hasEvidence]
  );

  const visible = useMemo(() => {
    const needle = normalise(search);
    // ⛔ Search spans EVERYTHING, always. A quiet alias with one conversation and no delivery
    // stamp is precisely what someone types an address to find; making them expand the list
    // first would reintroduce the problem this fixes.
    const pool = showAll || needle ? candidates : candidates.filter(hasEvidence);
    const filtered = needle
      ? pool.filter((entry) => entry.address.includes(needle))
      : pool;
    return [...filtered].sort((left, right) => {
      if (sort === 'address') return left.address.localeCompare(right.address);
      // A shared local part leads, THEN volume. Ranking by volume alone buries the
      // quiet members of a mailbox family: on one real workspace the `.pl` storefront
      // had a single conversation and sat 187th of 286 senders, below every noisy
      // newsletter, while its nine siblings were near the top. Flagged-first puts the
      // whole family together where it can be recognised in one pass.
      // Proven delivery ahead of the local-part guess, mirroring the backend's own order:
      // a customer called info@ at their own company matches the guess, our server's
      // delivery stamp is a fact.
      const leftDelivered = left.deliveredConversations > 0;
      const rightDelivered = right.deliveredConversations > 0;
      if (leftDelivered !== rightDelivered) return leftDelivered ? -1 : 1;
      if (left.likelyOurs !== right.likelyOurs) return left.likelyOurs ? -1 : 1;
      if (right.conversations !== left.conversations) {
        return right.conversations - left.conversations;
      }
      return left.address.localeCompare(right.address);
    });
  }, [candidates, search, sort, showAll, hasEvidence]);

  const addManual = useCallback(() => {
    const address = normalise(draft);
    if (!address.includes('@') || address.startsWith('@') || address.endsWith('@')) {
      setDraftError('That does not look like an email address.');
      return;
    }
    setSelected((current) => (current.includes(address) ? current : [...current, address]));
    // Already listed by one of the other sources — select it instead of adding a
    // duplicate row, so typing an address that is further down a long list still
    // does what was meant.
    if (!candidates.some((entry) => entry.address === address)) {
      setManual((current) => [
        ...current,
        {
          address,
          origin: 'manual',
          conversations: 0,
          lastSeenAt: null,
          configured: false,
          attachedElsewhere: false,
          likelyOurs: false,
          deliveredConversations: 0,
        },
      ]);
    }
    setDraft('');
    setDraftError(null);
  }, [draft, candidates]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // `type` is required or the API 400s: ids repeat across message_sources and
      // ai_providers, so the type disambiguates which table to update. The aliases
      // array REPLACES wholesale, so send the full intended set — never the filtered
      // view, which is why `selected` is not derived from `visible`.
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
        <span className="flex gap-1 items-center text-sm font-medium">
          <AtSign className="w-3.5 h-3.5" /> Addresses this mailbox answers to
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
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading mail history…
        </div>
      )}

      {!loading && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Turn on the addresses that belong to this mailbox. Replies your team sends from
            them will then be recognised as yours instead of appearing as new customer mail.
            Leave anything you do not recognise switched off.
          </p>

          {unavailable && (
            <p className="py-2 text-xs text-muted-foreground">
              This workspace&apos;s backend cannot suggest addresses yet, so nothing is listed
              below. You can still add addresses by hand, and aliases already declared keep
              working.
            </p>
          )}

          {failed && (
            <p className="py-2 text-xs text-muted-foreground">
              We couldn&apos;t read this mailbox&apos;s history just now, so nothing is listed
              below — this is a temporary failure, not a mailbox with no addresses. Close and
              reopen to try again. You can still add addresses by hand, and aliases already
              declared keep working.
            </p>
          )}

          <div className="flex gap-2 items-end mb-2">
            <div className="flex-1">
              <Input
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setDraftError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addManual();
                  }
                }}
                placeholder="Add an address by hand, e.g. info@shop.de"
                aria-label="Add an address by hand"
              />
            </div>
            <Button size="sm" variant="outline" onClick={addManual} disabled={!draft.trim()}>
              <Plus className="mr-1 w-3.5 h-3.5" />
              Add
            </Button>
          </div>
          {draftError && <p className="mb-2 text-xs text-danger">{draftError}</p>}

          {candidates.length > 3 && (
            <div className="flex gap-2 items-center mb-2">
              <div className="flex-1">
                <SearchInput value={search} onChange={setSearch} placeholder="Search addresses" />
              </div>
              {/*
                🪤 Bound the width. `Select` is `w-full` by default, which is right in a
                column but ruinous here: in a flex row its `flex-basis: auto` claims the
                whole line, and the search box beside it — `flex: 1 1 0%`, so basis 0 —
                collapses to a ~30px sliver with no visible text or placeholder. The
                search still FILTERED correctly, which is why it survived review: the
                bug is invisible to jsdom and to anyone reading the markup, where the
                `flex-1` wrapper looks entirely correct. `cn` is twMerge, so `w-48`
                resolves the conflict rather than fighting it.
                This only renders past 3 candidates; on the client mailbox this list was
                286 senders, where an unusable search is the whole feature.
              */}
              <Select
                className="w-48 shrink-0"
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value === 'address' ? 'address' : 'volume')
                }
                aria-label="Sort addresses"
              >
                <option value="volume">Most mail first</option>
                <option value="address">A–Z</option>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {visible.map((entry) => (
              <div
                key={entry.address}
                className="flex gap-2 justify-between items-center px-2 py-1.5 rounded border border-border/60 bg-background"
              >
                <div className="min-w-0">
                  <div className="flex gap-1.5 items-center">
                    <span className="text-xs truncate">{entry.address}</span>
                    {entry.configured && (
                      <Badge variant="secondary" className="text-[10px]">
                        configured
                      </Badge>
                    )}
                    {entry.deliveredConversations > 0 && !entry.configured && (
                      <Badge variant="success" className="text-[10px]">
                        delivered to you
                      </Badge>
                    )}
                    {entry.likelyOurs && !entry.configured && entry.deliveredConversations === 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        matches your mailbox
                      </Badge>
                    )}
                    {entry.attachedElsewhere && (
                      <Badge variant="warning" className="text-[10px]">
                        another mailbox
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {ORIGIN_LABEL[entry.origin]}
                    {entry.conversations > 0 && (
                      <>
                        {' · '}
                        {entry.conversations} conversation
                        {entry.conversations === 1 ? '' : 's'} · last{' '}
                        {formatLastSeen(entry.lastSeenAt)}
                      </>
                    )}
                  </span>
                </div>
                <Toggle
                  checked={entry.configured || selected.includes(entry.address)}
                  // The configured address is ours by definition and cannot be
                  // un-declared here; switching it off would only mislead.
                  disabled={entry.configured || entry.attachedElsewhere || saving}
                  onChange={() => toggle(entry.address)}
                  label={`Treat ${entry.address} as this mailbox`}
                />
              </div>
            ))}
          </div>

          {/*
            "No addresses suggested yet" is a statement about the MAILBOX, and the
            two paragraphs above are statements about the BACKEND. Render both and
            the panel contradicts itself: "this is a temporary failure, not a
            mailbox with no addresses" directly above "No addresses suggested yet".
            Telling those two states apart is the whole point of that copy, so the
            empty-state stays out of the way whenever the read did not happen.

            An active search still gets its answer: with 4+ declared aliases the
            search box renders even on a failed read, and silence there would look
            like the filter had broken.
          */}
          {unevidencedCount > 0 && search === '' && (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="mt-2 text-xs underline text-muted-foreground hover:text-foreground"
            >
              {showAll
                ? 'Show only addresses with evidence'
                : `Show ${unevidencedCount} more address${unevidencedCount === 1 ? '' : 'es'} seen in your mail`}
            </button>
          )}

          {visible.length === 0 && (search !== '' || !(failed || unavailable)) && (
            <p className="py-2 text-xs text-muted-foreground">
              {search
                ? 'No address matches that search.'
                : unevidencedCount > 0
                  ? 'Nothing here looks like this mailbox. Anything we have seen is under the link below.'
                  : 'No addresses suggested yet — add one by hand above.'}
            </p>
          )}

          {thinCoverage && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Delivery addresses are known for {coverage.withDeliveryAddress} of{' '}
              {coverage.conversations} conversations — older mail was stored before they were
              recorded, so this list is drawn mostly from who sent to you.
            </p>
          )}

          <div className="flex gap-2 justify-end mt-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="mr-1 w-3 h-3 animate-spin" />}
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
