import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { CategoriesSettings } from './CategoriesSettings';
import { LabelsSettings } from './LabelsSettings';
import { RoutingKeysSettings } from './RoutingKeysSettings';
import { SLAConfigSettings } from './SLAConfigSettings';
import { SecuritySettings } from './SecuritySettings';

type OrgSection = 'categories' | 'labels' | 'routing-skills' | 'sla-config' | 'security';

const sections = [
  { id: 'categories' as OrgSection, label: 'Categories', description: 'Ticket categories and keywords' },
  { id: 'labels' as OrgSection, label: 'Labels', description: 'Custom ticket labels' },
  { id: 'routing-skills' as OrgSection, label: 'Routing Skills', description: 'Skill keys for auto-assignment' },
  { id: 'sla-config' as OrgSection, label: 'SLA Thresholds', description: 'Response and resolution time targets' },
  { id: 'security' as OrgSection, label: 'Security', description: 'Password policy and 2FA requirements' },
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
  const { isAdmin, isOrgAdmin } = usePermissions();

  // The "Workspace" tab is reachable by moderators (VIEW_ORGANIZATION_SETTINGS), but the
  // Security sub-section configures workspace-wide auth policy (2FA enforcement) — an
  // admin-only control. Gate it to org_admin+ / global admin so it isn't shown to
  // moderators. UX-only; the BE requireOrgAdmin guard remains the real authority.
  const canManageSecurity = isAdmin || isOrgAdmin;
  const visibleSections = canManageSecurity
    ? sections
    : sections.filter((sect) => sect.id !== 'security');

  const requested = section && isOrgSection(section) ? section : 'categories';
  // Don't let a non-admin deep-link (#organization/security) land on a hidden tab.
  const initial: OrgSection =
    requested === 'security' && !canManageSecurity ? 'categories' : requested;
  const [active, setActive] = useState<OrgSection>(initial);

  useEffect(() => {
    if (!section || !isOrgSection(section)) return;
    setActive(section === 'security' && !canManageSecurity ? 'categories' : section);
  }, [section, canManageSecurity]);

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
          Manage ticket categories and custom labels
        </p>
      </div>

      <div className="flex gap-2 p-1 rounded-lg border bg-muted/50">
        {visibleSections.map((sect) => (
          <button
            key={sect.id}
            onClick={() => goToSection(sect.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
              active === sect.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            title={sect.description}
          >
            {sect.label}
          </button>
        ))}
      </div>

      {active === 'categories' && <CategoriesSettings />}
      {active === 'labels' && <LabelsSettings />}
      {active === 'routing-skills' && <RoutingKeysSettings />}
      {active === 'sla-config' && <SLAConfigSettings />}
      {active === 'security' && canManageSecurity && <SecuritySettings />}
    </div>
  );
};
