import { create } from 'zustand';
import type { Organization } from '@/services/organization.service';

type OrganizationsState = {
  currentOrganization: Organization | null;
  allOrganizations: Organization[];
  searchQuery: string;
  lastFetch: number | null;
  currentOrgLastFetch: number | null;
  
  setCurrentOrganization: (org: Organization | null) => void;
  setAllOrganizations: (orgs: Organization[]) => void;
  setSearchQuery: (query: string) => void;
  clearCache: () => void;
  shouldRefetch: () => boolean;
  shouldRefetchCurrentOrg: () => boolean;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useOrganizationsStore = create<OrganizationsState>((set, get) => ({
  currentOrganization: null,
  allOrganizations: [],
  searchQuery: '',
  lastFetch: null,
  currentOrgLastFetch: null,

  setCurrentOrganization: (org) => {
    set({ currentOrganization: org, currentOrgLastFetch: Date.now() });
  },

  setAllOrganizations: (orgs) => {
    set({ allOrganizations: orgs, lastFetch: Date.now() });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  clearCache: () => {
    set({ 
      currentOrganization: null,
      allOrganizations: [], 
      lastFetch: null,
      currentOrgLastFetch: null 
    });
  },

  shouldRefetch: () => {
    const state = get();
    if (!state.lastFetch) return true;
    return Date.now() - state.lastFetch > CACHE_TTL;
  },

  shouldRefetchCurrentOrg: () => {
    const state = get();
    if (!state.currentOrgLastFetch) return true;
    return Date.now() - state.currentOrgLastFetch > CACHE_TTL;
  },
}));
