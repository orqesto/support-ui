import { create } from 'zustand';
import type { Organization } from '@/services/organization.service';

type OrganizationsState = {
  currentOrganization: Organization | null;
  currentOrgLastFetch: number | null;

  setCurrentOrganization: (org: Organization | null) => void;
  clearCache: () => void;
  shouldRefetchCurrentOrg: () => boolean;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useOrganizationsStore = create<OrganizationsState>((set, get) => ({
  currentOrganization: null,
  currentOrgLastFetch: null,

  setCurrentOrganization: (org) => {
    set({ currentOrganization: org, currentOrgLastFetch: Date.now() });
  },

  clearCache: () => {
    set({ currentOrganization: null, currentOrgLastFetch: null });
  },

  shouldRefetchCurrentOrg: () => {
    const state = get();
    if (!state.currentOrgLastFetch) {
      return true;
    }
    return Date.now() - state.currentOrgLastFetch > CACHE_TTL;
  },
}));
