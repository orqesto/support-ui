import { lazy, type ComponentType } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  UsersRound,
  KeyRound,
  ShieldCheck,
  ScrollText,
  Settings,
  Network,
  CreditCard,
  Package,
  ServerCog,
  SlidersHorizontal,
  MailOpen,
  type LucideIcon,
} from 'lucide-react';

/**
 * Declarative console section registry — the single source of truth for BOTH the
 * AdminShell sidebar and the child <Route>s generated in App.tsx (mirrors
 * SettingsPage's SETTINGS_TABS pattern). The nav entry and route stay in sync
 * because both read this array. As of 05-09 every section mounts its real page.
 */
export type ConsoleScopeCtx = {
  scope: 'alliance' | 'platform' | null;
  isGlobalAdmin: boolean;
  allianceId: number | null;
};

export type ConsoleSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Path segment relative to `/console/alliance/:allianceId` ('' = index). */
  path: string;
  index?: boolean;
  element: ComponentType;
  /** UX gate only — the BE re-validates every call. Defaults to always-visible. */
  visible?: (ctx: ConsoleScopeCtx) => boolean;
};

const ConsoleOverview = lazy(() =>
  import('@/pages/console/ConsoleOverview').then((mod) => ({ default: mod.ConsoleOverview }))
);
const ConsoleOrganizations = lazy(() =>
  import('@/pages/console/ConsoleOrganizations').then((mod) => ({ default: mod.ConsoleOrganizations }))
);
const ConsoleMembers = lazy(() =>
  import('@/pages/console/ConsoleMembers').then((mod) => ({ default: mod.ConsoleMembers }))
);
const ConsoleGroups = lazy(() =>
  import('@/pages/console/ConsoleGroups').then((mod) => ({ default: mod.ConsoleGroups }))
);
const ConsoleIdentity = lazy(() =>
  import('@/pages/console/ConsoleIdentity').then((mod) => ({ default: mod.ConsoleIdentity }))
);
const ConsoleProvisioning = lazy(() =>
  import('@/pages/console/ConsoleProvisioning').then((mod) => ({ default: mod.ConsoleProvisioning }))
);
const ConsoleAudit = lazy(() =>
  import('@/pages/console/ConsoleAudit').then((mod) => ({ default: mod.ConsoleAudit }))
);
const ConsoleSettings = lazy(() =>
  import('@/pages/console/ConsoleSettings').then((mod) => ({ default: mod.ConsoleSettings }))
);

export const CONSOLE_SECTIONS: ConsoleSection[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '', index: true, element: ConsoleOverview },
  { id: 'organizations', label: 'Workspaces', icon: Building2, path: 'organizations', element: ConsoleOrganizations },
  { id: 'members', label: 'Members', icon: Users, path: 'members', element: ConsoleMembers },
  { id: 'groups', label: 'Groups', icon: UsersRound, path: 'groups', element: ConsoleGroups },
  { id: 'identity', label: 'Identity', icon: KeyRound, path: 'identity', element: ConsoleIdentity },
  { id: 'provisioning', label: 'Provisioning', icon: ShieldCheck, path: 'provisioning', element: ConsoleProvisioning },
  { id: 'audit', label: 'Audit', icon: ScrollText, path: 'audit', element: ConsoleAudit },
  { id: 'settings', label: 'Settings', icon: Settings, path: 'settings', element: ConsoleSettings },
];

// Platform console pages. P1 landed Organizations/Billing/Usage (reusing existing admin
// components); P2 adds Overview/Alliances/Users/System/Audit — every section now mounts a
// real surface. Kept separate from CONSOLE_SECTIONS so the alliance shell/routes are untouched.
const PlatformOverview = lazy(() =>
  import('@/pages/console/PlatformOverview').then((mod) => ({ default: mod.PlatformOverview }))
);
const PlatformAlliances = lazy(() =>
  import('@/pages/console/PlatformAlliances').then((mod) => ({ default: mod.PlatformAlliances }))
);
const PlatformOrganizations = lazy(() =>
  import('@/pages/console/PlatformOrganizations').then((mod) => ({ default: mod.PlatformOrganizations }))
);
const PlatformUsers = lazy(() =>
  import('@/pages/console/PlatformUsers').then((mod) => ({ default: mod.PlatformUsers }))
);
const PlatformBilling = lazy(() =>
  import('@/pages/console/PlatformBilling').then((mod) => ({ default: mod.PlatformBilling }))
);
const PlatformUsage = lazy(() =>
  import('@/pages/console/PlatformUsage').then((mod) => ({ default: mod.PlatformUsage }))
);
const PlatformSystem = lazy(() =>
  import('@/pages/console/PlatformSystem').then((mod) => ({ default: mod.PlatformSystem }))
);
const PlatformDefaults = lazy(() =>
  import('@/pages/console/PlatformDefaults').then((mod) => ({ default: mod.PlatformDefaults }))
);
const PlatformAudit = lazy(() =>
  import('@/pages/console/PlatformAudit').then((mod) => ({ default: mod.PlatformAudit }))
);
// System-wide email templates (invitation / verification / password-reset). Global-admin
// scoped, so it lives in the platform console rather than the main app nav.
const PlatformEmailTemplates = lazy(() =>
  import('@/pages/EmailTemplatesPage').then((mod) => ({ default: mod.EmailTemplates }))
);

/**
 * Platform (global-admin) console sections — same shell, platform scope. Paths are
 * relative to `/console/platform`. Every section mounts its real page as of P2.
 */
export const PLATFORM_SECTIONS: ConsoleSection[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '', index: true, element: PlatformOverview },
  { id: 'alliances', label: 'Alliances', icon: Network, path: 'alliances', element: PlatformAlliances },
  { id: 'organizations', label: 'Workspaces', icon: Building2, path: 'organizations', element: PlatformOrganizations },
  { id: 'users', label: 'Users', icon: Users, path: 'users', element: PlatformUsers },
  { id: 'usage', label: 'Subscriptions', icon: CreditCard, path: 'usage', element: PlatformUsage },
  { id: 'billing', label: 'Plans & Pricing', icon: Package, path: 'billing', element: PlatformBilling },
  { id: 'system', label: 'System', icon: ServerCog, path: 'system', element: PlatformSystem },
  { id: 'defaults', label: 'Platform Defaults', icon: SlidersHorizontal, path: 'defaults', element: PlatformDefaults },
  { id: 'email-templates', label: 'Email Templates', icon: MailOpen, path: 'email-templates', element: PlatformEmailTemplates },
  { id: 'audit', label: 'Audit', icon: ScrollText, path: 'audit', element: PlatformAudit },
];
