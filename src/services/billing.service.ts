import { apiClient } from '@/lib/api-client';

export type BillingSummary = {
  activeSubscriptions: number;
  totalMonthlySpend: number;
  anomalyCount: number;
  ghostCharges: number;
};

export type BillingRecord = {
  id: number;
  organizationId: number;
  messageId: number | null;
  paymentRegistryId: number | null;
  vendorName: string;
  amount: number;
  currency: string;
  chargeDate: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  isGhostCharge: boolean;
  isZombie: boolean;
  isDuplicate: boolean;
  isAmountDrift: boolean;
  anomalyDetails: string | null;
  status: string;
  createdAt: string;
};

export type RegistryEntry = {
  id: number;
  organizationId: number;
  vendorName: string;
  description: string | null;
  baselineAmount: number | null;
  currency: string;
  billingCycle: string;
  isActive: boolean;
  lastSeenAt: string | null;
  firstSeenAt: string | null;
};

export type AgingBucket = {
  label: string;
  count: number;
  total: number;
};

export type PaginatedResponse<T> = {
  records?: T[];
  entries?: T[];
  total: number;
  page: number;
  limit: number;
};

const getBillingSummary = () =>
  apiClient.get<BillingSummary>('/api/billing/summary').then((r) => r.data);

const getBillingRecords = (page = 1, limit = 20, anomalyOnly = false) =>
  apiClient
    .get<PaginatedResponse<BillingRecord>>('/api/billing/records', {
      params: { page, limit, anomalyOnly },
    })
    .then((r) => r.data);

const getPaymentRegistry = (page = 1, limit = 20) =>
  apiClient
    .get<PaginatedResponse<RegistryEntry>>('/api/billing/registry', {
      params: { page, limit },
    })
    .then((r) => r.data);

const getAgingReport = () =>
  apiClient.get<{ buckets: AgingBucket[] }>('/api/billing/aging').then((r) => r.data);

export const billingService = {
  getBillingSummary,
  getBillingRecords,
  getPaymentRegistry,
  getAgingReport,
};
