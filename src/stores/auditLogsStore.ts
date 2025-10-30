import { create } from 'zustand';
import type { AuditLog, AuditLogFilters } from '@/services/auditLog.service';

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
