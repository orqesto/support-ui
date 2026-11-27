import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StrictFeatureGate } from '@/components/common/StrictFeatureGate';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { ColumnDef } from '@/components/ui/DataTable/dataTable.types';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import {
  EMBEDDED_FLOWS,
  FLOW_LABELS,
  PAYLOAD_FIELDS,
  payloadFromValues,
  sameJson,
  valuesFromPayload,
  type FieldValues,
} from '@/features/rule-library/payloadFields';
import {
  createLibraryItem,
  listLibraryItems,
  RULE_LIBRARY_FLOWS,
  updateLibraryItem,
  type RuleLibraryFlow,
  type RuleLibraryItem,
} from '@/features/rule-library/services/ruleLibrary.service';
import { getApiErrorMessage, getErrorBody, getErrorStatus } from '@/lib/errorMessages';

import { RULE_LIBRARY_CONSOLE_FLAG } from './ruleLibraryConsoleFlag';

const PAGE_SIZE = 25;
const KEY = ['platform', 'rule-library'];

export const STALE_TEXT = 'Someone else changed this item — reload';
export const UNSAFE_PATTERN_TEXT = 'This pattern could hang mail processing';
export const EMBEDDING_TEXT = "Could not compute the example's meaning; nothing saved";

/** What to tell the admin about a failed save. The server's text is shown only for a validation error. */
export const describeError = (err: unknown): string => {
  const status = getErrorStatus(err);
  const body = getErrorBody(err);
  if (status === 409 || body?.code === 'STALE_ITEM') return STALE_TEXT;
  if (body?.code === 'UNSAFE_PATTERN') return UNSAFE_PATTERN_TEXT;
  if (status === 503 || body?.code === 'EMBEDDING_UNAVAILABLE') return EMBEDDING_TEXT;
  if (body?.code === 'VALIDATION_ERROR' && typeof body.error === 'string' && body.error) return body.error;
  return getApiErrorMessage(err) ?? (err instanceof Error ? err.message : 'Could not save.');
};

/** The per-field detail of a failed validation: the BE sends zod issues `{path, message}`. */
export const ruleLibraryIssueLines = (err: unknown): string[] => {
  const issues = (getErrorBody(err) as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue: unknown) => {
    const { path, message } = (issue ?? {}) as { path?: unknown; message?: unknown };
    if (typeof message !== 'string') return [];
    const where = Array.isArray(path) ? path.join('.') : '';
    return [where ? `${where}: ${message}` : message];
  });
};

/** A stored null and an absent key mean the same to the backend; do not call that a change. */
const withoutNulls = (payload: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null));

type Draft = {
  id: number | null;
  flow: RuleLibraryFlow;
  name: string;
  description: string;
  purposeGroup: string;
  active: boolean;
  updatedAt: string;
  basePayload: Record<string, unknown>;
  values: FieldValues;
};

const draftOf = (flow: RuleLibraryFlow, item: RuleLibraryItem | null): Draft => ({
  id: item?.id ?? null,
  flow: item?.flow ?? flow,
  name: item?.name ?? '',
  description: item?.description ?? '',
  purposeGroup: item?.purposeGroup ?? '',
  active: item?.active ?? true,
  updatedAt: item?.updatedAt ?? '',
  basePayload: item?.payload ?? {},
  values: valuesFromPayload(item?.flow ?? flow, item?.payload ?? {}),
});

const FLOW_OPTIONS = RULE_LIBRARY_FLOWS.map((flow) => ({ value: flow, label: FLOW_LABELS[flow] }));

const RuleLibraryPage = () => {
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<RuleLibraryFlow>('spam');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [missingDescription, setMissingDescription] = useState(false);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<{ text: string; lines: string[] } | null>(null);

  const params = {
    flow,
    q: searchTerm || undefined,
    active: archived ? false : true,
    missingDescription: missingDescription || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const query = useQuery({ queryKey: [...KEY, params], queryFn: () => listLibraryItems(params) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const save = useMutation({
    mutationFn: async (next: Draft) => {
      const payload = payloadFromValues(next.flow, next.basePayload, next.values);
      return next.id === null
        ? createLibraryItem({
            flow: next.flow,
            name: next.name.trim(),
            description: next.description.trim(),
            ...(next.purposeGroup.trim() ? { purposeGroup: next.purposeGroup.trim() } : {}),
            payload,
          })
        : updateLibraryItem(next.id, {
            updatedAt: next.updatedAt,
            name: next.name.trim(),
            description: next.description.trim(),
            purposeGroup: next.purposeGroup.trim() || null,
            // Only a changed payload goes out, so a description or active edit never re-validates an old one.
            ...(sameJson(withoutNulls(payload), withoutNulls(next.basePayload)) ? {} : { payload }),
            active: next.active,
          });
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      void refresh();
    },
    onError: (err) => {
      setError({ text: describeError(err), lines: ruleLibraryIssueLines(err) });
      // A stale item: reload the list so re-opening Edit carries the new updatedAt.
      if (getErrorStatus(err) === 409 || getErrorBody(err)?.code === 'STALE_ITEM') void refresh();
    },
  });
  const locked = save.isPending;

  const counts = query.data?.countsByFlow;
  const tabs = RULE_LIBRARY_FLOWS.map((id) => ({
    id,
    label: FLOW_LABELS[id],
    badge: counts?.[id],
  }));

  const columns: ColumnDef<RuleLibraryItem>[] = [
    { id: 'name', header: 'Name', cell: (row) => row.name, card: 'title' },
    { id: 'purpose', header: 'Purpose group', cell: (row) => row.purposeGroup ?? '' },
    { id: 'origin', header: 'Preset origin', cell: (row) => row.originPresetKey ?? '' },
    {
      id: 'embedding',
      header: 'Embedding',
      cell: (row) =>
        !row.hasEmbedding && EMBEDDED_FLOWS.includes(row.flow) ? (
          <Badge variant="warning">no embedding</Badge>
        ) : null,
    },
    {
      id: 'active',
      header: 'Active',
      cell: (row) => <Badge variant={row.active ? 'success' : 'secondary'}>{row.active ? 'Active' : 'Archived'}</Badge>,
    },
  ];

  const fields = draft ? PAYLOAD_FIELDS[draft.flow] : [];
  const setValue = (key: string, value: string | boolean) =>
    setDraft((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev));

  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Rule library"
        description="Platform-wide rule templates. Editing a template changes what new workspaces and presets start from; it never changes a workspace's existing rules."
        actions={
          <Button
            disabled={locked}
            onClick={() => {
              setError(null);
              setDraft(draftOf(flow, null));
            }}
          >
            New item
          </Button>
        }
      />
      {error && (
        <Alert variant="danger">
          {error.text}
          {error.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {error.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {draft && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            {draft.id === null ? (
              <Select
                label="Flow"
                disabled={locked}
                options={FLOW_OPTIONS}
                value={draft.flow}
                onChange={(next) => {
                  const nextFlow = next as RuleLibraryFlow;
                  setDraft({ ...draft, flow: nextFlow, basePayload: {}, values: valuesFromPayload(nextFlow, {}) });
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Flow: {FLOW_LABELS[draft.flow]}</p>
            )}
            <Input
              label="Name"
              disabled={locked}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <Textarea
              label="Description"
              disabled={locked}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <Input
              label="Purpose group"
              disabled={locked}
              value={draft.purposeGroup}
              onChange={(event) => setDraft({ ...draft, purposeGroup: event.target.value })}
            />
            {draft.id !== null && (
              <Toggle
                checked={draft.active}
                disabled={locked}
                label="Active"
                onChange={(next) => setDraft({ ...draft, active: next })}
              />
            )}
            {fields.map((field) => {
              const raw = draft.values[field.key];
              const str = typeof raw === 'string' ? raw : '';
              if (field.kind === 'boolean') {
                return (
                  <Toggle
                    key={field.key}
                    checked={raw === true}
                    disabled={locked}
                    label={field.label}
                    onChange={(next) => setValue(field.key, next)}
                  />
                );
              }
              if (field.kind === 'enum') {
                return (
                  <Select
                    key={field.key}
                    label={field.label}
                    disabled={locked}
                    isClearable={!field.required}
                    options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
                    value={str}
                    onChange={(next) => setValue(field.key, next)}
                  />
                );
              }
              if (field.kind === 'longtext' || field.kind === 'list' || field.kind === 'json') {
                return (
                  <Textarea
                    key={field.key}
                    label={field.label}
                    disabled={locked}
                    value={str}
                    onChange={(event) => setValue(field.key, event.target.value)}
                  />
                );
              }
              return (
                <Input
                  key={field.key}
                  label={field.label}
                  type={field.kind === 'number' ? 'number' : 'text'}
                  disabled={locked}
                  value={str}
                  onChange={(event) => setValue(field.key, event.target.value)}
                />
              );
            })}
            <div className="flex gap-2">
              <Button isLoading={locked} disabled={locked || draft.name.trim() === ''} onClick={() => save.mutate(draft)}>
                Save
              </Button>
              <Button
                variant="secondary"
                disabled={locked}
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Tabs
        tabs={tabs}
        activeTab={flow}
        onTabChange={(next) => {
          setFlow(next);
          setPage(1);
        }}
      />
      <div className="flex flex-wrap gap-6">
        <Toggle
          checked={missingDescription}
          label="Missing description"
          onChange={(next) => {
            setMissingDescription(next);
            setPage(1);
          }}
        />
        <Toggle
          checked={archived}
          label="Archived"
          onChange={(next) => {
            setArchived(next);
            setPage(1);
          }}
        />
      </div>
      <DataTable
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        columns={columns}
        actions={(row) => (
          <Button
            size="sm"
            variant="secondary"
            disabled={locked}
            onClick={() => {
              setError(null);
              setDraft(draftOf(row.flow, row));
            }}
          >
            Edit
          </Button>
        )}
        search={{
          value: searchInput,
          onChange: setSearchInput,
          placeholder: 'Search name or description',
          showButton: true,
          onCommit: () => {
            setSearchTerm(searchInput.trim());
            setPage(1);
          },
        }}
        pagination={{
          mode: 'server',
          page,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
          total,
          limit: PAGE_SIZE,
          onPageChange: setPage,
          loading: query.isFetching,
        }}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        empty={{ message: 'No items.' }}
        actionsLabel="Edit"
      />
    </div>
  );
};

export const PlatformRuleLibrary = () => (
  <StrictFeatureGate flag={RULE_LIBRARY_CONSOLE_FLAG} title="Rule library">
    <RuleLibraryPage />
  </StrictFeatureGate>
);
