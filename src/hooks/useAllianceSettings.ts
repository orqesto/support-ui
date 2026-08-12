import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  allianceSettingsService,
  type AllianceSettings,
  type AllianceSettingsInput,
} from '@/services/alliance-settings.service';

/**
 * React-query hooks for the alliance Settings section (05-09). Keys namespaced by
 * allianceId:
 *   ['alliance', id, 'settings']  — name/slug/defaults
 * The update mutation invalidates settings + overview (the overview card shows the
 * alliance name). The detach-all danger-zone mutation invalidates overview + the
 * org lists (orgs, attachable-orgs) since it changes org membership. All mutations
 * surface sonner toasts; a slug collision (409) is bubbled through the error message.
 */

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export const useAllianceSettings = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'settings'],
    queryFn: () => allianceSettingsService.getSettings(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

export const useUpdateAllianceSettings = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AllianceSettingsInput): Promise<AllianceSettings> =>
      allianceSettingsService.updateSettings(allianceId as number, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'overview'] });
      toast.success('Settings saved');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not save settings')),
  });
};

/**
 * Delete the alliance (global-admin only). On success the alliance no longer exists, so
 * invalidate the caller's alliance list + the platform overview; the caller routes out of
 * the console. A 409 (a workspace slipped back in via a concurrent attach) bubbles as a toast.
 */
export const useDeleteAlliance = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => allianceSettingsService.deleteAlliance(allianceId as number),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alliance', 'mine'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
      toast.success('Alliance deleted');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not delete alliance')),
  });
};

export const useDetachAllOrgs = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => allianceSettingsService.detachAllOrgs(allianceId as number),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'overview'] });
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'orgs'] });
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'attachable-orgs'] });
      // The switcher's orgCount comes from ['alliance','mine'] — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ['alliance', 'mine'] });
      toast.success(
        result.detachedCount === 1
          ? 'Detached 1 organization from the alliance'
          : `Detached ${result.detachedCount} organizations from the alliance`
      );
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not detach organizations')),
  });
};
