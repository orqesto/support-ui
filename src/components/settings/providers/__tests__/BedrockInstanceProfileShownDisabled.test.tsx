/**
 * An option that is unavailable must SAY so, not vanish.
 *
 * The console's Platform Defaults card renders the instance-profile switch greyed with a
 * reason on a deployment whose server has no AWS identity. This card filtered the same option
 * out of the list entirely, so the two surfaces disagreed about one deployment and the honest
 * answer — "the server ignores it here, use IAM keys" — was never shown. Comparing the two
 * screens read as "defaults is broken" (owner, 2026-09-11).
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const backendVersion = vi.fn<() => { data: { bedrockInstanceProfile: boolean } | undefined }>();
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useBedrockModels', () => ({ useBedrockModels: () => ({ data: undefined }) }));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => backendVersion() }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { BedrockProviderCard } from '@/components/settings/providers/BedrockProviderCard';

const openForm = () => {
  render(
    <BedrockProviderCard
      integrations={[]}
      showModels={{}}
      deleting={null}
      saving={null}
      toggling={null}
      editingId={null}
      onToggleModels={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggleEnabled={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Add Bedrock/i }));
};

const instanceProfileRadio = () => screen.getByRole('radio', { name: /EC2 instance profile/i });

afterEach(cleanup);

describe('the EC2 instance profile option', () => {
  it('is shown but disabled, with a reason, when the server has no AWS identity', () => {
    backendVersion.mockReturnValue({ data: { bedrockInstanceProfile: false } });
    openForm();

    expect(instanceProfileRadio()).toBeDisabled();
    expect(screen.getByText(/Not available on this deployment/i)).toBeInTheDocument();
  });

  it('is selectable where the server does have one', () => {
    backendVersion.mockReturnValue({ data: { bedrockInstanceProfile: true } });
    openForm();

    expect(instanceProfileRadio()).not.toBeDisabled();
    expect(screen.queryByText(/Not available on this deployment/i)).not.toBeInTheDocument();
  });

  it('stays disabled while the deployment is still unknown', () => {
    // The workspace card has always defaulted to "no" here; a radio that flips to enabled
    // mid-load invites a click on a setting the server will ignore.
    backendVersion.mockReturnValue({ data: undefined });
    openForm();

    expect(instanceProfileRadio()).toBeDisabled();
  });
});
