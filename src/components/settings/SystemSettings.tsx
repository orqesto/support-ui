import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SystemManagementSettings } from './SystemManagementSettings';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { DeletedMessages } from '@/pages/DeletedMessagesPage';
import { OrphanedOutbound } from '@/pages/OrphanedOutboundPage';

type SystemSection = 'cleanup' | 'deleted' | 'orphaned';

const SECTIONS: { id: SystemSection; label: string; description: string; globalOnly: boolean }[] = [
  { id: 'cleanup', label: 'Cleanup', description: 'Queues, data cleanup, and nuclear options', globalOnly: true },
  { id: 'deleted', label: 'Deleted Messages', description: 'Recover soft-deleted messages', globalOnly: true },
  { id: 'orphaned', label: 'Orphaned Outbound', description: 'Outbound messages with no threaded parent', globalOnly: true },
];

const sectionAllowed = (value: string, isGlobalAdmin: boolean): value is SystemSection =>
  SECTIONS.some((sect) => sect.id === value && (isGlobalAdmin || !sect.globalOnly));

type SystemSettingsProps = {
  /** Sub-section id from the parent hash (`/settings#system/deleted`). */
  section?: string;
  /** Global admins get the recovery/diagnostic sub-tabs; org_admins see Cleanup only. */
  isGlobalAdmin: boolean;
};

/**
 * Settings › System — system operations grouped as sub-tabs, ALL global-admin only.
 * "Cleanup" (queues / data cleanup / nuclear) hits /api/system/* routes the backend
 * locked to global-admin (BE #272), and the recovery/diagnostic tools (Deleted
 * Messages, Orphaned Outbound) were already global-only. The whole tab is hidden from
 * org_admins upstream in SettingsPage. Folded here (was three separate main-nav
 * entries) so system ops live in one place.
 */
export const SystemSettings = ({ section, isGlobalAdmin }: SystemSettingsProps) => {
  const navigate = useNavigate();
  const visibleSections = SECTIONS.filter((sect) => isGlobalAdmin || !sect.globalOnly);

  const requested = section && sectionAllowed(section, isGlobalAdmin) ? section : 'cleanup';
  const [active, setActive] = useState<SystemSection>(requested);

  useEffect(() => {
    if (section && sectionAllowed(section, isGlobalAdmin)) setActive(section);
  }, [section, isGlobalAdmin]);

  const goToSection = (next: SystemSection) => {
    setActive(next);
    navigate(`#system/${next}`, { replace: true });
  };

  const tabs: Tab<SystemSection>[] = visibleSections.map((sect) => ({
    id: sect.id,
    label: sect.label,
    description: sect.description,
  }));

  const content = (
    <>
      {active === 'cleanup' && <SystemManagementSettings />}
      {active === 'deleted' && isGlobalAdmin && <DeletedMessages />}
      {active === 'orphaned' && isGlobalAdmin && <OrphanedOutbound />}
    </>
  );

  // Only render the sub-tab switcher when there's a choice (org_admins see Cleanup only).
  return (
    <div className="space-y-6">
      {tabs.length > 1 ? (
        <Tabs<SystemSection>
          tabs={tabs}
          activeTab={active}
          onTabChange={goToSection}
          variant="simple"
          showIcons={false}
        >
          {content}
        </Tabs>
      ) : (
        content
      )}
    </div>
  );
};
