import { create } from 'zustand';
import type { AuditLog, AuditLogFilters } from '@/services/auditLog.service';
import { onOrganizationSwitch } from './identityScope';

type AuditLogsState = {
  logs: AuditLog[];
  filters: AuditLogFilters;
  setLogs: (logs: AuditLog[]) => void;
  setFilters: (filters: AuditLogFilters) => void;
  resetFilters: () => void;
};

const initialFilters: AuditLogFilters = {
  action: undefined,
  entity: undefined,
  userId: undefined,
  startDate: undefined,
  endDate: undefined,
  page: 1,
  limit: 50,
};

export const useAuditLogsStore = create<AuditLogsState>((set) => ({
  logs: [],
  filters: initialFilters,
  setLogs: (logs) => {
    set({ logs });
  },
  setFilters: (filters) => {
    set({ filters: { ...filters } });
  },
  resetFilters: () => {
    set({ filters: initialFilters });
  },
}));

// One global slot: evict rows AND the `userId` filter on an org switch — a user id from
// workspace A is not a user in workspace B, and the rows are A's until the refetch lands.
onOrganizationSwitch(() => useAuditLogsStore.setState({ logs: [], filters: initialFilters }));
