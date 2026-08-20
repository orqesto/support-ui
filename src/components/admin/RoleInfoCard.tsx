import { Info, Check, X, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ORGANIZATION_ROLES, Permission, rolePermissions } from '@/types/roles';
import type { OrganizationRole } from '@/types/roles';

/**
 * Presentational catalog: the human label + grouping for each permission. This is the
 * ONLY hand-maintained part of the guide — whether a role HAS a permission is derived
 * from `rolePermissions` (the single RBAC source of truth), so the ✓/✗ column can never
 * drift from what the app actually enforces. Keyed on the `Permission` enum, so renaming
 * or removing a permission is a compile error here rather than a silently-stale card.
 */
type PermissionGroup = {
  category: string;
  permissions: Array<{ permission: Permission; label: string }>;
};

export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    category: 'User Management',
    permissions: [
      { permission: Permission.VIEW_USERS, label: 'View users' },
      { permission: Permission.CREATE_USERS, label: 'Create users' },
      { permission: Permission.MANAGE_USERS, label: 'Edit users' },
      { permission: Permission.DELETE_USERS, label: 'Delete users' },
    ],
  },
  {
    category: 'Organization & Settings',
    permissions: [
      { permission: Permission.MANAGE_ORGANIZATION, label: 'Manage workspace settings' },
      { permission: Permission.VIEW_ORGANIZATION_SETTINGS, label: 'View workspace settings' },
      {
        permission: Permission.MANAGE_MEMBER_DEPARTMENTS,
        label: 'Assign members to departments',
      },
    ],
  },
  {
    category: 'Integrations & Message Sources',
    permissions: [
      {
        permission: Permission.MANAGE_INTEGRATIONS,
        label: 'Manage integrations (Email, Telegram, Slack, Jira)',
      },
      { permission: Permission.VIEW_INTEGRATIONS, label: 'View integrations' },
      // Distinct from the two above: `integrations` is the connector config, `message
      // sources` are the mailboxes/channels themselves. All four org roles can view them
      // server-side, which is why an Associate card showing only "View integrations ✗"
      // read as more restrictive than the role actually is.
      {
        permission: Permission.MANAGE_MESSAGE_SOURCES,
        label: 'Manage message sources (mailboxes, channels)',
      },
      { permission: Permission.VIEW_MESSAGE_SOURCES, label: 'View message sources' },
      {
        permission: Permission.ASSIGN_USERS_TO_SOURCES,
        label: 'Assign members to message sources',
      },
    ],
  },
  {
    category: 'Categories & Labels',
    permissions: [
      { permission: Permission.MANAGE_CATEGORIES, label: 'Manage categories' },
      { permission: Permission.VIEW_CATEGORIES, label: 'View categories' },
      { permission: Permission.MANAGE_LABELS, label: 'Manage labels' },
      { permission: Permission.VIEW_LABELS, label: 'View labels' },
    ],
  },
  {
    category: 'AI & Automation',
    permissions: [
      { permission: Permission.MANAGE_AI_PROMPTS, label: 'Configure AI prompts' },
      { permission: Permission.MANAGE_SPAM_RULES, label: 'Manage spam rules' },
      { permission: Permission.VIEW_AI_SETTINGS, label: 'View AI settings' },
    ],
  },
  {
    category: 'Tickets',
    permissions: [
      { permission: Permission.VIEW_TICKETS, label: 'View tickets' },
      { permission: Permission.CREATE_TICKETS, label: 'Create tickets' },
      { permission: Permission.MANAGE_TICKETS, label: 'Manage tickets' },
      { permission: Permission.ASSIGN_TICKETS, label: 'Assign tickets' },
      { permission: Permission.DELETE_TICKETS, label: 'Delete tickets' },
      { permission: Permission.REQUEST_TICKET_CHANGE, label: 'Request ticket changes' },
    ],
  },
  {
    category: 'Messages',
    permissions: [
      { permission: Permission.VIEW_MESSAGES, label: 'View messages' },
      { permission: Permission.MANAGE_MESSAGES, label: 'Manage messages' },
      { permission: Permission.PROCESS_MESSAGES, label: 'Process & assign messages' },
      { permission: Permission.DELETE_MESSAGES, label: 'Delete messages' },
      { permission: Permission.REQUEST_MESSAGE_CHANGE, label: 'Request message changes' },
    ],
  },
  {
    category: 'Analytics & Audit',
    permissions: [
      { permission: Permission.VIEW_STATISTICS, label: 'View statistics' },
      { permission: Permission.VIEW_REPORTS, label: 'View reports' },
      { permission: Permission.VIEW_AUDIT_LOGS, label: 'View audit logs' },
    ],
  },
  {
    category: 'Subscription & Billing',
    permissions: [
      { permission: Permission.VIEW_SUBSCRIPTION, label: 'View subscription' },
      { permission: Permission.MANAGE_SUBSCRIPTION, label: 'Manage subscription' },
      { permission: Permission.VIEW_USAGE_STATS, label: 'View usage statistics' },
      { permission: Permission.MANAGE_AI_MODULES, label: 'Enable/disable AI modules' },
      { permission: Permission.VIEW_BILLING, label: 'View billing' },
      { permission: Permission.MANAGE_BILLING, label: 'Manage billing' },
    ],
  },
];

const roleDescriptions: Record<OrganizationRole, string> = {
  org_admin:
    'Full control over workspace settings, users, integrations, and billing. Can manage everything except creating other workspace admins.',
  moderator:
    'Operational manager with control over integrations, AI configuration, and ticket management. Cannot manage users or billing.',
  support:
    'Handles tickets and messages. Can process and resolve customer inquiries but cannot access settings or user management.',
  associate:
    'Read-only access with ability to request changes. Ideal for trainees or external consultants who need visibility without direct control.',
};

/** Does the role's effective permission set include this permission? (source of truth). */
const roleHasPermission = (role: OrganizationRole, permission: Permission): boolean =>
  rolePermissions[role].includes(permission);

const titleCase = (role: OrganizationRole): string =>
  role.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

type Size = 'sm' | 'md';

/** The grouped ✓/✗ permission matrix for one role — shared by the compact and full views. */
const RolePermissionMatrix = ({ role, size }: { role: OrganizationRole; size: Size }) => {
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const headingSize = size === 'sm' ? 'text-xs mb-1.5' : 'text-sm mb-2';
  return (
    <div className={size === 'sm' ? 'grid gap-3 mt-3' : 'grid md:grid-cols-2 gap-4'}>
      {PERMISSION_CATALOG.map((group) => (
        <div key={group.category}>
          <h4 className={`font-semibold text-foreground ${headingSize}`}>{group.category}</h4>
          <ul className={size === 'sm' ? 'space-y-0.5' : 'space-y-1'}>
            {group.permissions.map(({ permission, label }) => {
              const granted = roleHasPermission(role, permission);
              return (
                <li key={permission} className={`flex items-start gap-1.5 ${textSize}`}>
                  {granted ? (
                    <Check
                      className={`${iconSize} text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5`}
                    />
                  ) : (
                    <X
                      className={`${iconSize} text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5`}
                    />
                  )}
                  <span className={granted ? '' : 'text-muted-foreground'}>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};

type RoleInfoCardProps = {
  role?: OrganizationRole;
  compact?: boolean;
};

export const RoleInfoCard = ({ role, compact = false }: RoleInfoCardProps) => {
  const roles: OrganizationRole[] = role ? [role] : [...ORGANIZATION_ROLES];

  if (compact && role) {
    return (
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="w-4 h-4" />
            {titleCase(role)} Role
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{roleDescriptions[role]}</p>
          <RolePermissionMatrix role={role} size="sm" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {roles.map((currentRole) => (
        <Card key={currentRole} className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {titleCase(currentRole)} Role
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">{roleDescriptions[currentRole]}</p>
          </CardHeader>
          <CardContent>
            <RolePermissionMatrix role={currentRole} size="md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
