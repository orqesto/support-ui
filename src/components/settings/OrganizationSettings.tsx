import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs } from '@/components/ui/Tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { CategoriesSettings } from './CategoriesSettings';
import { LabelsSettings } from './LabelsSettings';
import { RoutingKeysSettings } from './RoutingKeysSettings';
import { BusinessHoursSettings } from './BusinessHoursSettings';
import { SLAConfigSettings } from './SLAConfigSettings';
import { SecuritySettings } from './SecuritySettings';
import { WorkspaceDetailsSettings } from './WorkspaceDetailsSettings';

type OrgSection =
  | 'details'
  | 'categories'
  | 'labels'
  | 'routing-skills'
  | 'sla-config'
  | 'business-hours'
  | 'security';

const sections = [
  { id: 'details' as OrgSection, label: 'Details', description: 'Workspace name and description' },
  { id: 'categories' as OrgSection, label: 'Categories', description: 'Ticket categories and keywords' },
  { id: 'labels' as OrgSection, label: 'Labels', description: 'Custom ticket labels' },
  { id: 'routing-skills' as OrgSection, label: 'Routing Skills', description: 'Skill keys for auto-assignment' },
  { id: 'sla-config' as OrgSection, label: 'SLA Thresholds', description: 'Response and resolution time targets' },
  { id: 'business-hours' as OrgSection, label: 'Business Hours', description: 'Working calendar used for open-hours response times' },
  { id: 'security' as OrgSection, label: 'Authentication', description: 'Workspace two-factor authentication policy' },
];

// Workspace-wide policy sub-sections — admin-only (org_admin+/global), hidden from
// moderators who can otherwise reach the Workspace tab via VIEW_ORGANIZATION_SETTINGS.
const ADMIN_ONLY_SECTIONS: OrgSection[] = ['sla-config', 'business-hours', 'security'];

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
  const { isAdmin, isOrgAdmin } = usePermissions();

  // The "Workspace" tab is reachable by moderators (VIEW_ORGANIZATION_SETTINGS), but SLA
  // Thresholds, Business Hours and Authentication configure workspace-wide policy (SLA
  // targets, the working calendar every response metric reads, 2FA enforcement) —
  // admin-only controls. Gate them to org_admin+ / global admin so they
  // aren't shown to moderators. UX-only; the BE requireOrgAdmin guard is the authority.
  const canManageOrgPolicy = isAdmin || isOrgAdmin;
  const visibleSections = canManageOrgPolicy
    ? sections
    : sections.filter((sect) => !ADMIN_ONLY_SECTIONS.includes(sect.id));

  const requested = section && isOrgSection(section) ? section : 'details';
  // Don't let a non-admin deep-link (#organization/sla-config|security) land on a hidden tab.
  const initial: OrgSection =
    ADMIN_ONLY_SECTIONS.includes(requested) && !canManageOrgPolicy ? 'categories' : requested;
  const [active, setActive] = useState<OrgSection>(initial);

  useEffect(() => {
    if (!section || !isOrgSection(section)) return;
    setActive(
      ADMIN_ONLY_SECTIONS.includes(section) && !canManageOrgPolicy ? 'categories' : section
    );
  }, [section, canManageOrgPolicy]);

  const goToSection = (next: OrgSection) => {
    setActive(next);
    navigate(`#organization/${next}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex gap-2 items-center text-xl font-semibold">
          <Layers className="w-5 h-5" />
          Workspace
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace details, categories, and labels
        </p>
      </div>

      <Tabs<OrgSection>
        tabs={visibleSections.map((sect) => ({ id: sect.id, label: sect.label, description: sect.description }))}
        activeTab={active}
        onTabChange={goToSection}
        variant="simple"
        showIcons={false}
      >
        {active === 'details' && <WorkspaceDetailsSettings />}
        {active === 'categories' && <CategoriesSettings />}
        {active === 'labels' && <LabelsSettings />}
        {active === 'routing-skills' && <RoutingKeysSettings />}
        {active === 'sla-config' && canManageOrgPolicy && <SLAConfigSettings />}
        {active === 'business-hours' && canManageOrgPolicy && <BusinessHoursSettings />}
        {active === 'security' && canManageOrgPolicy && <SecuritySettings />}
      </Tabs>
    </div>
  );
};
