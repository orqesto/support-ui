import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss the dropdown on outside click / Escape without a focusable overlay element.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

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

  const handleSelect = (id: number) => {
    setIsOpen(false);
    navigate(`/console/alliance/${id}`);
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex gap-2 items-center px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card hover:bg-accent"
      >
        <Building2 className="flex-shrink-0 w-4 h-4" />
        <span className="truncate max-w-[16rem]">{current?.name ?? 'Select alliance'}</span>
        <ChevronDown className="flex-shrink-0 w-4 h-4" />
      </Button>

      {isOpen && (
        <div className="overflow-y-auto absolute left-0 top-full z-20 mt-2 w-72 max-h-80 rounded-md border shadow-lg bg-card border-border">
          <div className="p-2">
            {alliances.map((alliance) => (
              <Button
                key={alliance.id}
                variant="ghost"
                onClick={() => handleSelect(alliance.id)}
                className="flex gap-2 justify-between items-center px-3 py-2 w-full h-auto text-sm text-left rounded-md hover:bg-accent"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{alliance.name}</span>
                  <span className="block text-xs truncate text-muted-foreground">
                    {alliance.orgCount} workspace{alliance.orgCount === 1 ? '' : 's'}
                  </span>
                </span>
                {alliance.id === currentId && (
                  <Check className="flex-shrink-0 ml-2 w-4 h-4 text-primary" />
                )}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
