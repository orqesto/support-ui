import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  platformSettingsService,
  type DefaultStorageInput,
  type ManagedAiInput,
  type PlatformSecretKey,
} from '@/services/platformSettings.service';

const KEY = ['platform', 'settings'] as const;

export const usePlatformSettings = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => platformSettingsService.get(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

/** Mutations all invalidate the settings query so the source badges + statuses refresh. */
export const useUpdatePlatformAi = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManagedAiInput) => platformSettingsService.updateAi(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useUpdatePlatformStorage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DefaultStorageInput) => platformSettingsService.updateStorage(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useSetPlatformSecret = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: PlatformSecretKey; value: string }) =>
      platformSettingsService.setSecret(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useClearPlatformSecret = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: PlatformSecretKey) => platformSettingsService.clearSecret(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useTestPlatformStorage = () =>
  useMutation({
    mutationFn: (input: DefaultStorageInput) => platformSettingsService.testStorage(input),
  });
