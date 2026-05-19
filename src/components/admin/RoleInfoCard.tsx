import { Info, Check, X, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { OrganizationRole } from '@/types/roles';

type RoleCapability = {
  category: string;
  permissions: Array<{
    name: string;
    granted: boolean;
  }>;
};

const roleCapabilities: Record<OrganizationRole, RoleCapability[]> = {
  org_admin: [
    {
      category: 'User Management',
      permissions: [
        { name: 'Create users (except other org admins)', granted: true },
        { name: 'Edit users', granted: true },
        { name: 'Delete users', granted: true },
        { name: 'View users', granted: true },
      ],
    },
    {
      category: 'Integrations & Message Sources',
      permissions: [
        { name: 'Manage integrations (Email, Telegram, Slack, Jira)', granted: true },
        { name: 'Configure AI providers', granted: true },
      ],
    },
    {
      category: 'AI & Automation',
      permissions: [
        { name: 'Configure AI prompts', granted: true },
        { name: 'Manage spam rules', granted: true },
        { name: 'Manage categories', granted: true },
        { name: 'Configure ticket automation', granted: true },
      ],
    },
    {
      category: 'Tickets & Messages',
      permissions: [
        { name: 'Full ticket management', granted: true },
        { name: 'Full message management', granted: true },
        { name: 'Delete tickets/messages', granted: true },
      ],
    },
    {
      category: 'Subscription & Billing',
      permissions: [
        { name: 'Manage subscription plan', granted: true },
        { name: 'Enable/disable AI modules', granted: true },
        { name: 'View usage statistics', granted: true },
        { name: 'Manage billing', granted: true },
      ],
    },
    {
      category: 'Analytics & Audit',
      permissions: [
        { name: 'View statistics & reports', granted: true },
        { name: 'View audit logs', granted: true },
      ],
    },
  ],
  moderator: [
    {
      category: 'User Management',
      permissions: [
        { name: 'View users', granted: true },
        { name: 'Create/edit/delete users', granted: false },
      ],
    },
    {
      category: 'Integrations & Message Sources',
      permissions: [
        { name: 'Manage integrations (Email, Telegram, Slack, Jira)', granted: true },
        { name: 'Configure message sources', granted: true },
      ],
    },
    {
      category: 'AI & Automation',
      permissions: [
        { name: 'Configure AI prompts', granted: true },
        { name: 'Manage spam rules', granted: true },
        { name: 'Manage categories', granted: true },
        { name: 'Configure AI providers', granted: false },
      ],
    },
    {
      category: 'Tickets & Messages',
      permissions: [
        { name: 'Manage tickets', granted: true },
        { name: 'Manage messages', granted: true },
        { name: 'Process & assign tickets', granted: true },
        { name: 'Delete tickets/messages', granted: false },
      ],
    },
    {
      category: 'Subscription & Billing',
      permissions: [
        { name: 'View subscription & usage', granted: true },
        { name: 'Manage subscription', granted: false },
        { name: 'Enable/disable AI modules', granted: false },
      ],
    },
    {
      category: 'Analytics',
      permissions: [
        { name: 'View statistics', granted: true },
        { name: 'View audit logs', granted: false },
      ],
    },
  ],
  support: [
    {
      category: 'User Management',
      permissions: [
        { name: 'View users', granted: true },
        { name: 'Manage users', granted: false },
      ],
    },
    {
      category: 'Integrations & Settings',
      permissions: [
        { name: 'Manage integrations', granted: false },
        { name: 'Configure AI/automation', granted: false },
      ],
    },
    {
      category: 'Tickets & Messages',
      permissions: [
        { name: 'Manage tickets', granted: true },
        { name: 'Manage messages', granted: true },
        { name: 'Process & assign tickets', granted: true },
        { name: 'Delete tickets/messages', granted: false },
      ],
    },
    {
      category: 'Analytics',
      permissions: [
        { name: 'View statistics', granted: true },
        { name: 'View subscription & usage', granted: true },
      ],
    },
  ],
  associate: [
    {
      category: 'Access Level',
      permissions: [
        { name: 'View tickets (read-only)', granted: true },
        { name: 'View messages (read-only)', granted: true },
        { name: 'Request ticket changes', granted: true },
        { name: 'Request message changes', granted: true },
      ],
    },
    {
      category: 'Restrictions',
      permissions: [
        { name: 'Cannot manage tickets directly', granted: false },
        { name: 'Cannot manage users', granted: false },
        { name: 'Cannot access settings', granted: false },
        { name: 'Cannot view analytics', granted: false },
      ],
    },
  ],
};

const roleDescriptions: Record<OrganizationRole, string> = {
  org_admin:
    'Full control over organization settings, users, integrations, and billing. Can manage everything except creating other org admins.',
  moderator:
    'Operational manager with control over integrations, AI configuration, and ticket management. Cannot manage users or billing.',
  support:
    'Handles tickets and messages. Can process and resolve customer inquiries but cannot access settings or user management.',
  associate:
    'Read-only access with ability to request changes. Ideal for trainees or external consultants who need visibility without direct control.',
};

type RoleInfoCardProps = {
  role?: OrganizationRole;
  compact?: boolean;
};

export const RoleInfoCard = ({ role, compact = false }: RoleInfoCardProps) => {
  const roles: OrganizationRole[] = role
    ? [role]
    : ['org_admin', 'moderator', 'support', 'associate'];

  if (compact && role) {
    const capabilities = roleCapabilities[role];
    return (
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="w-4 h-4" />
            {role.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())} Role
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{roleDescriptions[role]}</p>
          <div className="grid gap-3 mt-3">
            {capabilities.map((cat) => (
              <div key={cat.category}>
                <h4 className="text-xs font-semibold text-foreground mb-1.5">{cat.category}</h4>
                <ul className="space-y-0.5">
                  {cat.permissions.map((perm) => (
                    <li key={perm.name} className="flex items-start gap-1.5 text-xs">
                      {perm.granted ? (
                        <Check className="w-3 h-3 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-3 h-3 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={perm.granted ? '' : 'text-muted-foreground'}>
                        {perm.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {roles.map((role) => {
        const capabilities = roleCapabilities[role];
        return (
          <Card key={role} className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {role.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())} Role
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">{roleDescriptions[role]}</p>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {capabilities.map((cat) => (
                  <div key={cat.category}>
                    <h4 className="text-sm font-semibold text-foreground mb-2">{cat.category}</h4>
                    <ul className="space-y-1">
                      {cat.permissions.map((perm) => (
                        <li key={perm.name} className="flex items-start gap-2 text-sm">
                          {perm.granted ? (
                            <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                          )}
                          <span
                            className={perm.granted ? '' : 'text-muted-foreground line-through'}
                          >
                            {perm.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
