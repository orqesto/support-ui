import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  budgetsService,
  type AllianceBudgetUpdate,
  type ExtraRequestBody,
  type GiveExtraBody,
  type GroupListParams,
  type GroupUpdate,
  type MigrationOverrides,
  type SettingsUpdate,
  type WorkspaceBudgetUpdate,
} from '@/services/budgets.service';

export const budgetKeys = {
  all: ['platform', 'budgets'] as const,
  state: ['platform', 'budgets', 'state'] as const,
  migration: ['platform', 'budgets', 'migration'] as const,
  groups: ['platform', 'budgets', 'groups'] as const,
  group: (key: string) => ['platform', 'budgets', 'group', key] as const,
  alliance: (allianceId: number | null) => ['alliance', allianceId, 'budget'] as const,
  workspace: ['workspace', 'ai-usage'] as const,
};

/** Whether the budget API exists and is switched on lives in the result; pages render a one-line notice. */
export const useBudgetState = () =>
  useQuery({
    queryKey: budgetKeys.state,
    queryFn: () => budgetsService.getState(),
    staleTime: 30_000,
  });

export const useBudgetMigration = (enabled = true) =>
  useQuery({
    queryKey: budgetKeys.migration,
    queryFn: () => budgetsService.getMigration(),
    enabled,
  });

export const useBudgetGroups = (params: GroupListParams, enabled = true) =>
  useQuery({
    queryKey: [...budgetKeys.groups, params] as const,
    queryFn: () => budgetsService.listGroups(params),
    enabled,
    placeholderData: (previous) => previous,
  });

export const useBudgetGroup = (key: string | null) =>
  useQuery({
    queryKey: budgetKeys.group(key ?? ''),
    queryFn: () => budgetsService.getGroup(key as string),
    enabled: key !== null,
  });

/** After any platform write: the group's page, the list and the state (open requests, settings). */
const invalidatePlatform = (queryClient: QueryClient, groupKey?: string) => {
  void queryClient.invalidateQueries({ queryKey: budgetKeys.groups });
  void queryClient.invalidateQueries({ queryKey: budgetKeys.state });
  if (groupKey) void queryClient.invalidateQueries({ queryKey: budgetKeys.group(groupKey) });
  else void queryClient.invalidateQueries({ queryKey: ['platform', 'budgets', 'group'] });
};

export const useApplyMigration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (overrides?: MigrationOverrides) => budgetsService.applyMigration(overrides),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetKeys.migration });
      invalidatePlatform(queryClient);
    },
  });
};

export const useUpdateBudgetGroup = (key: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GroupUpdate) => budgetsService.updateGroup(key, body),
    onSuccess: () => invalidatePlatform(queryClient, key),
  });
};

/** Group-scoped writes below take the group key so its page is refreshed. */
export const useSetWorkspaceLimits = (groupKey: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { organizationIds: number[]; limit: number | null }) =>
      budgetsService.setWorkspaceLimits(vars.organizationIds, vars.limit),
    onSuccess: () => invalidatePlatform(queryClient, groupKey),
  });
};

export const useGiveExtra = (groupKey?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GiveExtraBody) => budgetsService.giveExtra(body),
    onSuccess: () => invalidatePlatform(queryClient, groupKey),
  });
};

export const useEndExtra = (groupKey?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grantIds: number[]) => budgetsService.endExtra(grantIds),
    onSuccess: () => invalidatePlatform(queryClient, groupKey),
  });
};

export const useDeclineRequest = (groupKey?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => budgetsService.declineRequest(id),
    onSuccess: () => invalidatePlatform(queryClient, groupKey),
  });
};

export const useUpdateBudgetSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsUpdate) => budgetsService.updateSettings(body),
    onSuccess: () => invalidatePlatform(queryClient),
  });
};

// ---- organisation ----
export const useAllianceBudget = (allianceId: number | null) =>
  useQuery({
    queryKey: budgetKeys.alliance(allianceId),
    queryFn: () => budgetsService.getAllianceBudget(allianceId as number),
    enabled: allianceId !== null,
  });

export const useUpdateAllianceBudget = (allianceId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AllianceBudgetUpdate) =>
      budgetsService.updateAllianceBudget(allianceId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.alliance(allianceId) }),
  });
};

export const useSetAllianceWorkspaceLimits = (allianceId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { organizationIds: number[]; limit: number | null }) =>
      budgetsService.setAllianceWorkspaceLimits(allianceId, vars.organizationIds, vars.limit),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.alliance(allianceId) }),
  });
};

export const useRequestAllianceExtra = (allianceId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExtraRequestBody & { organizationId?: number }) =>
      budgetsService.requestAllianceExtra(allianceId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.alliance(allianceId) }),
  });
};

// ---- workspace ----
export const useMyAiUsage = () =>
  useQuery({ queryKey: budgetKeys.workspace, queryFn: () => budgetsService.getMyAiUsage() });

export const useUpdateMyBudget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkspaceBudgetUpdate) => budgetsService.updateMyBudget(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.workspace }),
  });
};

export const useRequestMyExtra = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExtraRequestBody) => budgetsService.requestMyExtra(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.workspace }),
  });
};
