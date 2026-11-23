import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs } from '@/components/ui/Tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import { CategoriesSettings } from './CategoriesSettings';
import { LabelsSettings } from './LabelsSettings';
import { RoutingKeysSettings } from './RoutingKeysSettings';
import { BusinessHoursSettings } from './BusinessHoursSettings';
import { OpenConversationWindowSettings } from './OpenConversationWindowSettings';
import { AutomaticReplySubjectsSettings } from './AutomaticReplySubjectsSettings';
import { SLAConfigSettings } from './SLAConfigSettings';
import { SecuritySettings } from './SecuritySettings';
import { WorkspaceDetailsSettings } from './WorkspaceDetailsSettings';
import { WorkspaceAiUsage } from './WorkspaceAiUsage';
import { NotificationRoleDefaults } from './NotificationRoleDefaults';
import { loadRoleDefaults } from '@/features/settings/services/notificationRoleDefaultsShared';
import { useAuthStore } from '@/stores/authStore';
import { firstVisibleId, useShowAdvanced, visibleSections } from '@/features/settings/advanced';
import { AdvancedToggle } from './AdvancedToggle';

type OrgSection =
  | 'details'
  | 'categories'
  | 'labels'
  | 'routing-skills'
  | 'sla-config'
  | 'business-hours'
  | 'open-conversations'
  | 'automatic-replies'
  | 'security'
  | 'ai-usage'
  | 'notification-roles';

// Settings simplification (2026-11-23): engine knobs behind "Show advanced settings".
const sections: Array<{ id: OrgSection; label: string; description: string; advanced?: boolean }> = [
  { id: 'details' as OrgSection, label: 'Details', description: 'Workspace name and description' },
  { id: 'categories' as OrgSection, label: 'Categories', description: 'Ticket categories and keywords' },
  { id: 'labels' as OrgSection, label: 'Labels', description: 'Custom ticket labels' },
  { id: 'routing-skills' as OrgSection, label: 'Routing Skills', description: 'Skill keys for auto-assignment', advanced: true },
  { id: 'sla-config' as OrgSection, label: 'SLA Thresholds', description: 'Response and resolution time targets' },
  { id: 'business-hours' as OrgSection, label: 'Business Hours', description: 'Working calendar used for open-hours response times' },
  { id: 'open-conversations' as OrgSection, label: 'Open Threads', description: 'How old an email may be and still count as open work', advanced: true },
  { id: 'automatic-replies' as OrgSection, label: 'Automated email subjects', description: 'Subjects of automatic emails that do not count as your answer. This does not send anything.', advanced: true },
  { id: 'security' as OrgSection, label: 'Authentication', description: 'Workspace two-factor authentication policy' },
  { id: 'ai-usage' as OrgSection, label: 'AI usage', description: 'AI budget per billing period and bulk processing' },
  { id: 'notification-roles' as OrgSection, label: 'Notifications by role', description: 'What each role is notified about by default, and what is locked' },
];

// Workspace-wide policy sub-sections — admin-only (org_admin+/global), hidden from
// moderators who can otherwise reach the Workspace tab via VIEW_ORGANIZATION_SETTINGS.
const ADMIN_ONLY_SECTIONS: OrgSection[] = [
  'business-hours',
  'open-conversations',
  'security',
  // Money (≈ $) is for workspace / platform admins; the AI usage tab is all money.
  'ai-usage',
  'notification-roles',
];

const KNOWN_ORG_SECTIONS = sections.map((sect) => sect.id);
const isOrgSection = (value: string): value is OrgSection =>
  (KNOWN_ORG_SECTIONS as string[]).includes(value);

type OrganizationSettingsProps = {
  /** Sub-section id from the parent's URL hash. Initializes the active tab
   *  and lets `/settings#organization/security` deep-link straight to Security. */
  section?: string;
};

export const OrganizationSettings = ({ section }: OrganizationSettingsProps = {}) => {
  const navigate = useNavigate();
  const { isAdmin, isOrgAdmin, hasPermission } = usePermissions();

  // The "Workspace" tab is reachable by moderators (VIEW_ORGANIZATION_SETTINGS), but SLA
  // Business Hours and Authentication configure workspace-wide policy (the
  // working calendar every response metric reads, 2FA enforcement) —
  // admin-only controls. Gate them to org_admin+ / global admin so they
  // aren't shown to moderators. UX-only; the BE requireOrgAdmin guard is the authority.
  const canManageOrgPolicy = isAdmin || isOrgAdmin;
  // SLA Thresholds: moderators too (owner, 2026-11-16) — saving and resetting need MANAGE_SLA_CONFIG on
  // the BE (admins and moderators); the targets are read with VIEW_ORGANIZATION_SETTINGS.
  const canManageSla =
    isAdmin ||
    (hasPermission(Permission.MANAGE_SLA_CONFIG) &&
      hasPermission(Permission.VIEW_ORGANIZATION_SETTINGS));
  // Routing Skills is all editing (assignment mode, self-edit toggles, keys, value descriptions,
  // the test box) and every one of those calls needs manage_routing_rules on the BE (admins and
  // moderators). Without it an agent saw every control, got 403 on each, and read a false
  // "No routing keys defined yet" (staging 2026-11-03). Agents keep their own skills on Profile.
  // The page also READS keys, mode and self-edit, which need view_organization_settings.
  const canManageRouting =
    isAdmin ||
    (hasPermission(Permission.MANAGE_ROUTING_RULES) &&
      hasPermission(Permission.VIEW_ORGANIZATION_SETTINGS));
  // Hidden until the server shows it has the endpoint (an older backend answers 403/400/404 for the path). The read is shared with the tab itself and remembered per workspace.
  const orgKey = useAuthStore((state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null);
  const [rolesAvailable, setRolesAvailable] = useState(false);
  useEffect(() => {
    setRolesAvailable(false);
    if (!canManageOrgPolicy) return;
    let live = true;
    loadRoleDefaults(orgKey)
      .then((res) => live && setRolesAvailable(res !== null))
      // A server error (5xx, network) says nothing about the endpoint: keep the tab so the admin can
      // open it and press Try again, rather than hiding it until the next reload. (An older server
      // answers 400/403/404, which the read turns into null above.)
      .catch(() => live && setRolesAvailable(true));
    return () => {
      live = false;
    };
  }, [canManageOrgPolicy, orgKey]);
  const isHidden = (sect: OrgSection): boolean =>
    (ADMIN_ONLY_SECTIONS.includes(sect) && !canManageOrgPolicy) ||
    (sect === 'sla-config' && !canManageSla) ||
    (sect === 'routing-skills' && !canManageRouting) ||
    (sect === 'notification-roles' && !rolesAvailable);
  const gatedSections = sections.filter((sect) => !isHidden(sect.id));
  const [showAdvanced] = useShowAdvanced();
  const linked = section && isOrgSection(section) ? section : undefined;
  const shown = visibleSections(gatedSections, showAdvanced, linked);
  // Default 'details'; a hidden link falls back to 'categories' as before, else the first shown.
  const fallbackFor = (preferred: OrgSection): OrgSection =>
    (firstVisibleId(shown, preferred) ?? 'details') as OrgSection;

  const [selected, setActive] = useState<OrgSection>(
    linked && shown.some((sect) => sect.id === linked) ? linked : fallbackFor(linked ? 'categories' : 'details')
  );

  useEffect(() => {
    if (!linked) return;
    setActive(shown.some((sect) => sect.id === linked) ? linked : fallbackFor('categories'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shown derives from these flags
  }, [section, canManageOrgPolicy, canManageRouting, canManageSla, rolesAvailable]);

  // Clamp at render: the open section is always one that is shown.
  const active: OrgSection = shown.some((sect) => sect.id === selected) ? selected : fallbackFor('details');

  const goToSection = (next: OrgSection) => {
    setActive(next);
    void navigate(`#organization/${next}`, { replace: true });
  };

  // From the toggle only: leave a section that Advanced just hid.
  const onTurnOff = () => {
    // Only a section that Advanced off now hides is left; one still shown keeps your place.
    if (visibleSections(gatedSections, false).some((sect) => sect.id === active)) return;
    const target = (firstVisibleId(visibleSections(gatedSections, false), 'details') ?? 'details') as OrgSection;
    setActive(target);
    void navigate(`#organization/${target}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display flex gap-2 items-center text-xl font-semibold">
          <Layers className="w-5 h-5" />
          Workspace
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace details, categories, and labels
        </p>
        <AdvancedToggle onTurnOff={onTurnOff} />
      </div>

      <Tabs<OrgSection>
        tabs={shown.map((sect) => ({ id: sect.id, label: sect.label, description: sect.description }))}
        activeTab={active}
        onTabChange={goToSection}
        variant="simple"
        showIcons={false}
      >
        {active === 'details' && <WorkspaceDetailsSettings />}
        {active === 'categories' && <CategoriesSettings />}
        {active === 'labels' && <LabelsSettings />}
        {active === 'routing-skills' && canManageRouting && <RoutingKeysSettings />}
        {active === 'sla-config' && canManageSla && <SLAConfigSettings />}
        {active === 'business-hours' && canManageOrgPolicy && <BusinessHoursSettings />}
        {active === 'open-conversations' && canManageOrgPolicy && <OpenConversationWindowSettings />}
        {/* Not admin-only: any member may read the list; the card itself offers editing to admins. */}
        {active === 'automatic-replies' && <AutomaticReplySubjectsSettings />}
        {active === 'security' && canManageOrgPolicy && <SecuritySettings />}
        {active === 'ai-usage' && canManageOrgPolicy && <WorkspaceAiUsage />}
        {active === 'notification-roles' && canManageOrgPolicy && <NotificationRoleDefaults />}
      </Tabs>
    </div>
  );
};
