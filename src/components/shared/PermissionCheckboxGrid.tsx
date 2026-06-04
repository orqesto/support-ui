import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import {
  Permission,
  rolePermissions,
  type OrganizationRole,
  type PermissionOverrides,
} from '@/types/roles';

type PermissionCheckboxGridProps = {
  role: OrganizationRole;
  overrides: PermissionOverrides;
  onChange: (next: PermissionOverrides) => void;
  disabled?: boolean;
};

// Display groupings — kept tight (~30 perms total) per spec. Order matters: most
// commonly tuned categories first.
const GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: 'Messages',
    permissions: [
      Permission.VIEW_MESSAGES,
      Permission.MANAGE_MESSAGES,
      Permission.PROCESS_MESSAGES,
      Permission.DELETE_MESSAGES,
      Permission.REQUEST_MESSAGE_CHANGE,
    ],
  },
  {
    label: 'Tickets',
    permissions: [
      Permission.VIEW_TICKETS,
      Permission.MANAGE_TICKETS,
      Permission.CREATE_TICKETS,
      Permission.ASSIGN_TICKETS,
      Permission.DELETE_TICKETS,
      Permission.REQUEST_TICKET_CHANGE,
    ],
  },
  {
    label: 'Users',
    permissions: [
      Permission.VIEW_USERS,
      Permission.MANAGE_USERS,
      Permission.CREATE_USERS,
      Permission.DELETE_USERS,
    ],
  },
  {
    label: 'Categories & Labels',
    permissions: [
      Permission.VIEW_CATEGORIES,
      Permission.MANAGE_CATEGORIES,
      Permission.VIEW_LABELS,
      Permission.MANAGE_LABELS,
    ],
  },
  {
    label: 'AI & Rules',
    permissions: [
      Permission.VIEW_AI_SETTINGS,
      Permission.MANAGE_AI_PROMPTS,
      Permission.MANAGE_SPAM_RULES,
    ],
  },
  {
    label: 'Integrations',
    permissions: [Permission.VIEW_INTEGRATIONS, Permission.MANAGE_INTEGRATIONS],
  },
  {
    label: 'Organization',
    permissions: [Permission.VIEW_ORGANIZATION_SETTINGS, Permission.MANAGE_ORGANIZATION],
  },
  {
    label: 'Reports & Audit',
    permissions: [
      Permission.VIEW_STATISTICS,
      Permission.VIEW_REPORTS,
      Permission.VIEW_USAGE_STATS,
      Permission.VIEW_AUDIT_LOGS,
    ],
  },
  {
    label: 'Billing & Subscription',
    permissions: [
      Permission.VIEW_BILLING,
      Permission.MANAGE_BILLING,
      Permission.VIEW_SUBSCRIPTION,
      Permission.MANAGE_SUBSCRIPTION,
      Permission.MANAGE_AI_MODULES,
    ],
  },
];

// Permissions considered high-impact — a small extra confirmation prevents
// accidental grants. The list is intentionally narrow; cf. spec risk #4.
const ELEVATED: Set<Permission> = new Set([
  Permission.MANAGE_BILLING,
  Permission.MANAGE_SUBSCRIPTION,
  Permission.MANAGE_ORGANIZATION,
  Permission.DELETE_USERS,
]);

// Human-friendly label for a permission constant.
const labelFor = (perm: Permission): string =>
  perm
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

export const PermissionCheckboxGrid = ({
  role,
  overrides,
  onChange,
  disabled,
}: PermissionCheckboxGridProps) => {
  const roleSet = useMemo(() => new Set(rolePermissions[role] ?? []), [role]);
  const added = useMemo(() => new Set(overrides.added ?? []), [overrides.added]);
  const removed = useMemo(() => new Set(overrides.removed ?? []), [overrides.removed]);

  // Effective: role default minus removed plus added. Drives the checkbox state.
  const isEffectivelyOn = (perm: Permission) =>
    (roleSet.has(perm) && !removed.has(perm)) || added.has(perm);

  // High-impact permissions trigger a themed confirm before granting. Track the
  // permission awaiting confirmation here so the ConfirmDialog can fire the
  // actual mutation when the admin OKs it.
  const [pendingElevated, setPendingElevated] = useState<Permission | null>(null);

  const applyToggle = (perm: Permission) => {
    const isOnNow = isEffectivelyOn(perm);
    const inRole = roleSet.has(perm);
    const nextAdded = new Set(added);
    const nextRemoved = new Set(removed);

    if (isOnNow) {
      // Turning off
      if (inRole) {
        // Was on via role → mark as removed override
        nextRemoved.add(perm);
        nextAdded.delete(perm); // in case it was double-listed
      } else {
        // Was on via added override → unset the override
        nextAdded.delete(perm);
      }
    } else {
      // Turning on
      if (inRole) {
        // Was off via removed override → unset the override
        nextRemoved.delete(perm);
      } else {
        // Was off (role doesn't grant) → add via override
        nextAdded.add(perm);
        nextRemoved.delete(perm); // in case it was double-listed
      }
    }

    onChange({
      added: Array.from(nextAdded).sort(),
      removed: Array.from(nextRemoved).sort(),
    });
  };

  const togglePermission = (perm: Permission) => {
    const isOnNow = isEffectivelyOn(perm);
    if (!isOnNow && ELEVATED.has(perm)) {
      // Defer the mutation until the admin confirms — themed ConfirmDialog
      // replaces the previous window.confirm guardrail.
      setPendingElevated(perm);
      return;
    }
    applyToggle(perm);
  };

  const reset = () => onChange({ added: [], removed: [] });

  const addedCount = added.size;
  const removedCount = removed.size;
  const hasOverrides = addedCount > 0 || removedCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          {hasOverrides
            ? `${addedCount > 0 ? `+${addedCount} added` : ''}${addedCount > 0 && removedCount > 0 ? ', ' : ''}${removedCount > 0 ? `−${removedCount} removed` : ''} vs role defaults`
            : 'Using role defaults.'}
        </p>
        {hasOverrides && (
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="flex gap-1 items-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to role defaults
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        {GROUPS.map((group) => (
          <fieldset
            key={group.label}
            className="p-3 rounded-md border border-border bg-muted/20"
          >
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </legend>
            <div className="space-y-1.5 mt-1">
              {group.permissions.map((perm) => {
                const checked = isEffectivelyOn(perm);
                const isAdded = added.has(perm);
                const isRemoved = removed.has(perm);
                const inRole = roleSet.has(perm);
                // Render hint: blue dot = explicit add, orange dot = explicit remove,
                // gray = role default (checked or not)
                const indicator = isAdded
                  ? 'bg-blue-500'
                  : isRemoved
                    ? 'bg-orange-500'
                    : 'bg-transparent';
                return (
                  <label
                    key={perm}
                    className="flex gap-2 items-start text-xs cursor-pointer"
                    title={
                      isAdded
                        ? 'Added via per-user override'
                        : isRemoved
                          ? 'Removed via per-user override'
                          : inRole
                            ? 'Granted by role default'
                            : 'Not granted'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermission(perm)}
                      disabled={disabled}
                      className="w-3.5 h-3.5 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="flex-1">{labelFor(perm)}</span>
                    <span
                      aria-hidden
                      className={`w-1.5 h-1.5 mt-1.5 rounded-full ${indicator}`}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <ConfirmDialog
        open={pendingElevated !== null}
        onOpenChange={(open) => {
          if (!open) setPendingElevated(null);
        }}
        onConfirm={() => {
          if (pendingElevated !== null) {
            applyToggle(pendingElevated);
            setPendingElevated(null);
          }
        }}
        title="Grant high-impact permission?"
        description={
          pendingElevated !== null
            ? `${labelFor(pendingElevated)} is a high-impact permission. Grant it to this user?`
            : ''
        }
        confirmText="Grant"
        variant="warning"
      />
    </div>
  );
};
