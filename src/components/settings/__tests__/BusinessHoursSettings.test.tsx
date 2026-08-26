import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

/**
 * Two things this UI must get right, both invisible until they bite.
 *
 * 1. It can reach production BEFORE its endpoint does. The frontend deploys on push; the
 *    backend ships on a tag. A 404 here means "not released yet", and rendering that as an
 *    error would have every admin reporting a bug that fixes itself at the next release.
 *    🪤 The api-client rebuilds failures as a fresh Error carrying `status` — there is no
 *    `err.response`, so the obvious `err.response.status` check silently never matches.
 *
 * 2. Saving an "enabled" calendar with no open day would be refused by the server. Catching
 *    it here means the admin gets a sentence instead of a 400.
 */
type BusinessHoursPayload = {
  configured: boolean;
  businessHours: {
    timezone: string;
    week: Record<string, Array<[string, string]>>;
    holidays?: string[];
  } | null;
};

const getBusinessHours = vi.fn<() => Promise<BusinessHoursPayload>>();
const updateBusinessHours = vi.fn<(payload: unknown) => Promise<BusinessHoursPayload>>();

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getBusinessHours: (): Promise<BusinessHoursPayload> => getBusinessHours(),
    updateBusinessHours: (payload: unknown): Promise<BusinessHoursPayload> =>
      updateBusinessHours(payload),
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: true, isOrgAdmin: true }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
// ReactSelect reads the theme context, which no settings test mounts a provider for.
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

const { BusinessHoursSettings } = await import('@/components/settings/BusinessHoursSettings');

afterEach(cleanup);
beforeEach(() => {
  getBusinessHours.mockReset();
  updateBusinessHours.mockReset();
});

describe('BusinessHoursSettings', () => {
  it('explains a 404 as "not deployed yet" rather than as a failure', async () => {
    getBusinessHours.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    render(<BusinessHoursSettings />);

    await waitFor(() =>
      expect(screen.getByText(/not available on this deployment yet/i)).toBeInTheDocument()
    );
    // Control: the alarming wording must NOT appear for this case.
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it('shows the calendar an org has already configured', async () => {
    getBusinessHours.mockResolvedValue({
      configured: true,
      businessHours: {
        timezone: 'Europe/Dublin',
        week: { mon: [['09:00', '17:00']] },
        holidays: ['2026-12-25'],
      },
    });

    render(<BusinessHoursSettings />);

    await waitFor(() => expect(screen.getByText('On')).toBeInTheDocument());
    expect(screen.getByLabelText('Monday opens')).toHaveValue('09:00');
    expect(screen.getByLabelText('Monday closes')).toHaveValue('17:00');
  });

  it('refuses to save an enabled calendar with no open day', async () => {
    // The server rejects this too; catching it here turns a 400 into a sentence.
    getBusinessHours.mockResolvedValue({
      configured: true,
      businessHours: { timezone: 'Europe/Dublin', week: {}, holidays: [] },
    });

    render(<BusinessHoursSettings />);
    await waitFor(() => expect(screen.getByText('On')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Save business hours'));

    await waitFor(() =>
      expect(screen.getByText(/Open at least one day/i)).toBeInTheDocument()
    );
    expect(updateBusinessHours).not.toHaveBeenCalled();
  });

  it('rejects a closing time that is not after the opening time', async () => {
    getBusinessHours.mockResolvedValue({
      configured: true,
      businessHours: { timezone: 'Europe/Dublin', week: { mon: [['17:00', '09:00']] }, holidays: [] },
    });

    render(<BusinessHoursSettings />);
    await waitFor(() => expect(screen.getByLabelText('Monday opens')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Save business hours'));

    await waitFor(() =>
      expect(screen.getByText(/closing time must be after/i)).toBeInTheDocument()
    );
    expect(updateBusinessHours).not.toHaveBeenCalled();
  });

  it('sends null to clear the calendar when switched off', async () => {
    getBusinessHours.mockResolvedValue({
      configured: true,
      businessHours: { timezone: 'Europe/Dublin', week: { mon: [['09:00', '17:00']] } },
    });
    updateBusinessHours.mockResolvedValue({ configured: false, businessHours: null });

    render(<BusinessHoursSettings />);
    await waitFor(() => expect(screen.getByText('On')).toBeInTheDocument());
    // Turning the feature off is a clear, not an empty calendar — the server distinguishes them.
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.click(screen.getByText('Save business hours'));

    await waitFor(() => expect(updateBusinessHours).toHaveBeenCalledWith(null));
  });
});
