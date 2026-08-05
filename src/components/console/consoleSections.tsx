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
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * Declarative console section registry — the single source of truth for BOTH the
 * AdminShell sidebar and the child <Route>s generated in App.tsx (mirrors
 * SettingsPage's SETTINGS_TABS pattern). Later waves swap a section's `element`
 * from the placeholder to its real page; the nav entry and route stay in sync
 * because both read this array. Overview is real in this wave (05-01); the rest
 * render a lightweight placeholder until their wave lands.
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

const ConsolePlaceholder = ({ title }: { title: string }) => (
  <Card>
    <CardContent>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This section arrives later in Phase 5.
      </p>
    </CardContent>
  </Card>
);

const makePlaceholder = (title: string): ComponentType => {
  const Placeholder = () => <ConsolePlaceholder title={title} />;
  Placeholder.displayName = `ConsolePlaceholder(${title})`;
  return Placeholder;
};

const ConsoleOverview = lazy(() =>
  import('@/pages/console/ConsoleOverview').then((mod) => ({ default: mod.ConsoleOverview }))
);

export const CONSOLE_SECTIONS: ConsoleSection[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '', index: true, element: ConsoleOverview },
  { id: 'organizations', label: 'Organizations', icon: Building2, path: 'organizations', element: makePlaceholder('Organizations') },
  { id: 'members', label: 'Members', icon: Users, path: 'members', element: makePlaceholder('Members') },
  { id: 'groups', label: 'Groups', icon: UsersRound, path: 'groups', element: makePlaceholder('Groups') },
  { id: 'identity', label: 'Identity', icon: KeyRound, path: 'identity', element: makePlaceholder('Identity') },
  { id: 'provisioning', label: 'Provisioning', icon: ShieldCheck, path: 'provisioning', element: makePlaceholder('Provisioning') },
  { id: 'audit', label: 'Audit', icon: ScrollText, path: 'audit', element: makePlaceholder('Audit log') },
  { id: 'settings', label: 'Settings', icon: Settings, path: 'settings', element: makePlaceholder('Settings') },
];
