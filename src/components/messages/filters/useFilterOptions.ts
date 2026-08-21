/**
 * Workspace-specific filter options: assignees, departments, sources, labels, aliases.
 *
 * One fetch site for all of them, so the desktop bar and the mobile sheet cannot drift
 * onto different option sets — they render from the same object.
 */
import { useEffect, useMemo, useState } from 'react';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { useDepartments } from '@/hooks/useDepartments';
import { assignmentService } from '@/services/assignment.service';
import { integrationsService } from '@/services/integrations.service';
import { labelService, type Label } from '@/services/settings.service';
import { messageService } from '@/services/message.service';
import { logger } from '@/lib/logger';
import { safeCssColor } from '@/lib/utils';
import { EMPTY_DYNAMIC_OPTIONS, type DynamicOptions, type FilterOption } from './filterSchema';

/** Channel headings for the source list — a bare list of mailbox names is unreadable. */
const CHANNEL_SECTION: Record<string, string> = {
  email: 'Email',
  gmail: 'Email',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  widget: 'Widget',
};

const MESSAGE_SOURCE_TYPES = Object.keys(CHANNEL_SECTION);

export const useFilterOptions = (): DynamicOptions => {
  const { data: departments = [] } = useDepartments();
  const [assignees, setAssignees] = useState<FilterOption[]>([]);
  const [sources, setSources] = useState<FilterOption[]>([]);
  const [labels, setLabels] = useState<FilterOption[]>([]);
  const [aliases, setAliases] = useState<FilterOption[]>([]);
  // The backend scopes both the source list and the alias list by department, so a
  // department switch has to refetch or the picker offers rows this scope cannot see.
  const departmentKey = useDepartmentContextKey();

  useEffect(() => {
    let cancelled = false;

    assignmentService
      .getAssignableUsers()
      .then((users) => {
        if (cancelled) return;
        setAssignees([
          { value: 'me', label: 'Me' },
          { value: 'unassigned', label: 'Unassigned' },
          ...users.map((user) => ({
            value: String(user.id),
            label: `${user.firstName} ${user.lastName}`.trim() || user.email,
          })),
        ]);
      })
      .catch((err: unknown) => logger.error('Filter options: assignees failed', err));

    integrationsService
      .getAll()
      .then((res) => {
        if (cancelled || !res.success || !res.data) return;
        setSources(
          res.data
            .filter((row) => MESSAGE_SOURCE_TYPES.includes(row.type))
            .map((row) => ({
              value: String(row.id),
              label: row.name,
              section: CHANNEL_SECTION[row.type],
            }))
        );
      })
      .catch((err: unknown) => logger.error('Filter options: sources failed', err));

    labelService
      .getLabels()
      .then((rows: Label[]) => {
        if (cancelled) return;
        setLabels(
          rows.map((row) => ({
            value: String(row.id),
            label: row.name,
            dot: safeCssColor(row.color),
          }))
        );
      })
      .catch((err: unknown) => logger.error('Filter options: labels failed', err));

    // Addresses mail actually arrived at — derived from traffic, not configuration,
    // because configuration does not know: a source stores one address and nobody
    // registers its aliases. Below two the filter separates nothing, and an empty list
    // is also how a backend without the route reports in (the service eats the 404), so
    // in both cases it yields no options and the schema drops the filter entirely.
    messageService
      .getReceivedAtOptions()
      .then((rows) => {
        if (cancelled) return;
        setAliases(
          rows.length < 2 ? [] : rows.map((address) => ({ value: address, label: address }))
        );
      })
      .catch(() => setAliases([]));

    return () => {
      cancelled = true;
    };
  }, [departmentKey]);

  const departmentOptions = useMemo<FilterOption[]>(
    () => [
      { value: 'needs_routing', label: 'Needs Routing' },
      ...departments
        .filter((dept) => dept.active !== false)
        .map((dept) => ({
          value: String(dept.id),
          label: dept.name,
          dot: dept.color ? safeCssColor(dept.color) : undefined,
        })),
    ],
    [departments]
  );

  return useMemo(
    () => ({
      ...EMPTY_DYNAMIC_OPTIONS,
      assignees,
      departments: departmentOptions,
      sources,
      labels,
      aliases,
    }),
    [assignees, departmentOptions, sources, labels, aliases]
  );
};
