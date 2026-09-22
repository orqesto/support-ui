import type { CSSProperties, ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebarStore';

/**
 * Wraps a sidebar entry in a right-side tooltip carrying its label, but only while
 * the sidebar is collapsed — expanded, the label is already on screen.
 */
export const NavTip = ({
  label,
  children,
  className = 'flex w-full',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => {
  const collapsed = useSidebarStore((state) => state.collapsed);
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip content={label} side="right" className={className}>
      {children}
    </Tooltip>
  );
};

export const SidebarCollapseToggle = ({ className }: { className?: string }) => {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggle = useSidebarStore((state) => state.toggle);
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    // Keyed on state: the button moves when the rail toggles, and a still-open tip
    // would otherwise stay where the button used to be.
    <Tooltip key={String(collapsed)} content={label} side="right">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={!collapsed}
        className={cn(
          'flex flex-shrink-0 justify-center items-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
          className
        )}
      >
        <Icon className="w-4 h-4" />
      </button>
    </Tooltip>
  );
};

/**
 * Where a switcher's menu opens from the collapsed rail: beside the rail, bottom-aligned
 * with its trigger. Fixed-positioned because the sidebar clips overflow, so an absolute
 * menu hanging off a 64px rail would be cut off.
 */
export const railMenuStyle = (trigger: HTMLElement | null): CSSProperties => {
  if (!trigger) return {};
  const rect = trigger.getBoundingClientRect();
  return { position: 'fixed', left: rect.right + 8, bottom: window.innerHeight - rect.bottom };
};

export const RAIL_QUERY = '(min-width: 1024px)';
