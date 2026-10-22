import { useState } from 'react';
import type { TicketDensity, TicketLayout } from './TicketTable';

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage — the choice still applies for this visit.
  }
};

/** Row density, list/split layout and status grouping: per-browser conveniences. */
export const useTicketListPrefs = () => {
  const [density, setDensityState] = useState<TicketDensity>(() =>
    read('tickets_density', ['table', 'cards'], 'table')
  );
  const [layout, setLayoutState] = useState<TicketLayout>(() =>
    read('tickets_layout', ['list', 'split'], 'list')
  );
  const [group, setGroupState] = useState(() => read('tickets_group', ['1', '0'], '0') === '1');
  return {
    density,
    layout,
    group,
    setDensity: (next: TicketDensity) => {
      setDensityState(next);
      write('tickets_density', next);
    },
    setLayout: (next: TicketLayout) => {
      setLayoutState(next);
      write('tickets_layout', next);
    },
    setGroup: (next: boolean) => {
      setGroupState(next);
      write('tickets_group', next ? '1' : '0');
    },
  };
};
