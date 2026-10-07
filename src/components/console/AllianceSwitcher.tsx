import { useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';

/**
 * Scope chip for the Alliance console (mirrors OrganizationSwitcher): a static
 * Badge when the admin governs a single alliance, a dropdown when >1. Selecting
 * an alliance navigates within the SPA (`/console/alliance/:id`) — no hard reload
 * or header swap (the scopeStore re-derives from the URL via AdminShell).
 */
export const AllianceSwitcher = () => {
  const { allianceId } = useParams();
  const currentId = allianceId ? Number(allianceId) : null;
  const navigate = useNavigate();
  const { data: alliances = [], isLoading } = useMyAlliances();

  if (isLoading) {
    return <Spinner size={16} />;
  }
  if (alliances.length === 0) {
    return null;
  }

  // Never substitute alliances[0] — a URL id that isn't in the list must not be
  // mislabeled as the current alliance (AdminShell renders the unauthorized state).
  const current = alliances.find((alliance) => alliance.id === currentId) ?? null;

  if (alliances.length === 1) {
    const only = alliances[0];
    return (
      <Badge variant="secondary" className="flex gap-2 items-center px-3 py-1.5">
        <Building2 className="w-3.5 h-3.5" />
        <span className="truncate">
          {only.name} — {only.orgCount} workspace{only.orgCount === 1 ? '' : 's'}
        </span>
      </Badge>
    );
  }

  return (
    <Select
      aria-label="Alliance"
      placeholder="Select alliance"
      className="w-72"
      value={current ? String(current.id) : undefined}
      onChange={(value) => navigate(`/console/alliance/${value}`)}
      options={alliances.map((alliance) => ({
        value: String(alliance.id),
        // The control shows the name, as the old button did; the menu adds the workspace count the
        // old list showed under each name, worded as the single-alliance badge above words it.
        label: alliance.name,
        menuLabel: `${alliance.name} — ${alliance.orgCount} workspace${alliance.orgCount === 1 ? '' : 's'}`,
      }))}
    />
  );
};
