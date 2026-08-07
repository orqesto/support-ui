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
  BarChart3,
  ServerCog,
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
  { id: 'organizations', label: 'Organizations', icon: Building2, path: 'organizations', element: ConsoleOrganizations },
  { id: 'members', label: 'Members', icon: Users, path: 'members', element: ConsoleMembers },
  { id: 'groups', label: 'Groups', icon: UsersRound, path: 'groups', element: ConsoleGroups },
  { id: 'identity', label: 'Identity', icon: KeyRound, path: 'identity', element: ConsoleIdentity },
  { id: 'provisioning', label: 'Provisioning', icon: ShieldCheck, path: 'provisioning', element: ConsoleProvisioning },
  { id: 'audit', label: 'Audit', icon: ScrollText, path: 'audit', element: ConsoleAudit },
  { id: 'settings', label: 'Settings', icon: Settings, path: 'settings', element: ConsoleSettings },
];

// P0 placeholder — one component for every platform section until P1 wires the real
// surfaces (most reuse existing admin components). Kept separate from CONSOLE_SECTIONS
// so the alliance shell/routes are untouched.
const PlatformPlaceholder = lazy(() =>
  import('@/pages/console/PlatformPlaceholder').then((mod) => ({ default: mod.PlatformPlaceholder }))
);
const PlatformOrganizations = lazy(() =>
  import('@/pages/console/PlatformOrganizations').then((mod) => ({ default: mod.PlatformOrganizations }))
);
const PlatformBilling = lazy(() =>
  import('@/pages/console/PlatformBilling').then((mod) => ({ default: mod.PlatformBilling }))
);
const PlatformUsage = lazy(() =>
  import('@/pages/console/PlatformUsage').then((mod) => ({ default: mod.PlatformUsage }))
);

/**
 * Platform (global-admin) console sections — same shell, platform scope. Paths are
 * relative to `/console/platform`. P0 mounts placeholders; P1 swaps in the real pages.
 */
export const PLATFORM_SECTIONS: ConsoleSection[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '', index: true, element: PlatformPlaceholder },
  { id: 'alliances', label: 'Alliances', icon: Network, path: 'alliances', element: PlatformPlaceholder },
  { id: 'organizations', label: 'Organizations', icon: Building2, path: 'organizations', element: PlatformOrganizations },
  { id: 'users', label: 'Users', icon: Users, path: 'users', element: PlatformPlaceholder },
  { id: 'billing', label: 'Billing & Plans', icon: CreditCard, path: 'billing', element: PlatformBilling },
  { id: 'usage', label: 'Usage', icon: BarChart3, path: 'usage', element: PlatformUsage },
  { id: 'system', label: 'System', icon: ServerCog, path: 'system', element: PlatformPlaceholder },
  { id: 'audit', label: 'Audit', icon: ScrollText, path: 'audit', element: PlatformPlaceholder },
];
