import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { Toggle } from '@/components/ui/Toggle';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { teamBuilderService } from '../../services/teamBuilder.service';
import type { WorkspaceLibraryItem } from '../../services/teamBuilder.service';
import { TEAM_FLOW_LABELS } from './teamLabels';

const PAGE_SIZE = 50;
/** The backend refuses more than this many ids in one apply (400); the picker stops here. */
export const MAX_PICKS = 200;
const CAP_NOTE_ID = 'library-picker-cap';
const OTHER_GROUP = 'Other';
const SEARCH_DELAY_MS = 300;
const FIRST_FLOW = 'spam';
/** Flows the library never lists: a capability is a role, the others are not team rules. */
const NOT_PICKABLE = new Set(['capability', 'kb_detection', 'auto_reply']);

type Props = { selected: Set<number>; onChange: (next: Set<number>) => void };

const groupItems = (items: WorkspaceLibraryItem[]): [string, WorkspaceLibraryItem[]][] => {
  const groups = new Map<string, WorkspaceLibraryItem[]>();
  for (const entry of items) {
    const key = entry.purposeGroup ?? OTHER_GROUP;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()];
};

/** Rules from the workspace library, one tab per flow; the ticks survive tab and page changes. */
export const LibraryPicker = ({ selected, onChange }: Props) => {
  // Starts on the first flow so no other flow's items flash under it; the counts then fix the tab.
  const [flow, setFlow] = useState<string | null>(FIRST_FLOW);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Both setters run here, not one inside the other's updater (an updater must stay pure).
      if (input !== query) {
        setQuery(input);
        setPage(1);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input, query]);

  const { data, isError, error, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['team-library', flow ?? '', query, page],
    queryFn: () =>
      teamBuilderService.listLibrary({
        flow: flow ?? undefined,
        q: query || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (data) setCounts(data.countsByFlow);
  }, [data]);

  // The backend never returns capability, kb_detection or auto_reply; the tabs are the flows that
  // have rules, in the label order.
  const tabs = Object.keys(TEAM_FLOW_LABELS)
    .filter((key) => !NOT_PICKABLE.has(key) && (counts?.[key] ?? 0) > 0)
    .map((key) => ({ id: key, label: TEAM_FLOW_LABELS[key], badge: counts?.[key] }));
  const firstTab = tabs.length > 0 ? tabs[0].id : null;
  const flowIsTab = flow !== null && tabs.some((tab) => tab.id === flow);
  useEffect(() => {
    if (counts === null || flowIsTab) return;
    // A search emptied the active tab (or nothing was chosen yet): the first tab left, or none.
    setFlow(firstTab);
    setPage(1);
  }, [counts, flowIsTab, firstTab]);

  const full = selected.size >= MAX_PICKS;
  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected);
    if (on) {
      if (full) return;
      next.add(id);
    } else next.delete(id);
    onChange(next);
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-3" data-testid="library-picker">
      <SearchInput
        value={input}
        onChange={setInput}
        placeholder="Search the library"
        ariaLabel="Search the library"
      />
      {tabs.length > 0 && flow !== null && flowIsTab && (
        <Tabs
          tabs={tabs}
          activeTab={flow}
          onTabChange={(next) => {
            setFlow(next);
            setPage(1);
          }}
          variant="simple"
          showIcons={false}
        />
      )}
      <p
        id={CAP_NOTE_ID}
        className={`text-sm ${full ? 'text-warning' : 'text-muted-foreground'}`}
        role="status"
      >
        {selected.size} of {MAX_PICKS} picked
        {full && ' — the most one request takes. Add more once these are in.'}
      </p>
      {isError && <Alert variant="danger">{getApiErrorMessage(error)}</Alert>}
      {isLoading && <Spinner />}
      {counts !== null && tabs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {query ? 'No rules match.' : 'The library has no rules.'}
        </p>
      )}
      {/* Not on the previous answer kept while the new tab's request runs (keepPreviousData), and
          not when this answer says the tab is empty: the tab is about to be replaced (the counts
          state catches up one render later). */}
      {data &&
        flow !== null &&
        flowIsTab &&
        !isPlaceholderData &&
        (data.countsByFlow?.[flow] ?? 0) > 0 &&
        data.items.length === 0 && <p className="text-sm text-muted-foreground">No rules match.</p>}
      {data &&
        flow !== null &&
        groupItems(data.items).map(([group, entries]) => (
          <section key={group} className="space-y-2">
            <h4 className="text-sm font-medium">{group}</h4>
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex gap-3 justify-between items-start p-3 rounded-lg border border-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{entry.name}</p>
                    {(entry.description || entry.preview) && (
                      <p className="text-xs text-muted-foreground">
                        {entry.description || entry.preview}
                      </p>
                    )}
                  </div>
                  <Toggle
                    checked={selected.has(entry.id)}
                    disabled={full && !selected.has(entry.id)}
                    ariaDescribedBy={full && !selected.has(entry.id) ? CAP_NOTE_ID : undefined}
                    ariaLabel={`Pick ${entry.name}`}
                    onChange={(next) => toggle(entry.id, next)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          total={data?.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
};
