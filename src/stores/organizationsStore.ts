import { create } from 'zustand';
import type { Organization } from '@/services/organization.service';
import { onOrganizationSwitch } from './identityScope';

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

// `currentOrganization` is whatever `getCurrent` last answered under whatever context was
// set at the time. After an org switch it is the PREVIOUS workspace until someone refetches,
// and `CreateUserModal` read its `isSystem` to offer the global-admin role. Evict.
onOrganizationSwitch(() => useOrganizationsStore.getState().clearCache());
