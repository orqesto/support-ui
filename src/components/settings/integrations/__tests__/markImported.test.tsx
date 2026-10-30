/**
 * Mark imported mail read + label it in the source mailbox (support-service#1229): the shared
 * control, the Gmail row (disabled until the Google grant can modify mail), the warning badge and
 * the list normaliser. Off unless the customer turns it on; the label defaults to "Odly".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type * as IntegrationsService from '@/services/integrations.service';

type Integration = IntegrationsService.Integration;

const update = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', async (importOriginal) => {
  const real = await importOriginal<typeof IntegrationsService>();
  return {
    ...real,
    integrationsService: { update: (...args: unknown[]) => update(...args) },
  };
});

const { GmailMarkImportedStrip } = await import('../GmailMarkImportedStrip');
const { MarkImportedControl } = await import('../MarkImportedControl');
const { SourceRowBadges } = await import('../SourceRowBadges');
const { gmailCanModify, readMarkImported, toSavedMarkImported } = await import('../markImported');
const { normalizeMarkImportedWarning } = await import('@/services/integrations.service');

const MODIFY = 'https://www.googleapis.com/auth/gmail.modify';
const TODAY_GRANT =
  'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

const gmailSource = (gmail: Record<string, unknown>) =>
  ({ id: 9, type: 'gmail', name: 'Support', config: { gmail } }) as unknown as Integration;

const toggle = () =>
  screen.getByRole('switch', { name: /mark imported messages as read and label them/i });

beforeEach(() => {
  update.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('helpers', () => {
  it('reads anything but enabled: true as off', () => {
    expect(readMarkImported(undefined)).toEqual({ enabled: false });
    expect(readMarkImported({ enabled: 'true' })).toEqual({ enabled: false });
    expect(readMarkImported({ enabled: true, label: 'Odly' })).toEqual({
      enabled: true,
      label: 'Odly',
    });
  });

  it('always sends the label (blank = default), so a PATCH merge cannot keep an old one', () => {
    expect(toSavedMarkImported({ enabled: true, label: '  Done ' })).toEqual({
      enabled: true,
      label: 'Done',
    });
    expect(toSavedMarkImported({ enabled: false })).toEqual({ enabled: false, label: '' });
  });

  it('a Gmail source can modify mail only when its stored grant lists gmail.modify', () => {
    expect(gmailCanModify({ gmail: { grantedScopes: TODAY_GRANT } })).toBe(false);
    expect(gmailCanModify({ gmail: { grantedScopes: `${TODAY_GRANT} ${MODIFY}` } })).toBe(true);
    expect(gmailCanModify({ gmail: {} })).toBe(false);
    expect(gmailCanModify(undefined)).toBe(false);
  });

  it('normalises the list warning and drops anything unknown (older backend: absent)', () => {
    expect(normalizeMarkImportedWarning(undefined)).toBeNull();
    expect(normalizeMarkImportedWarning({ status: 'weird' })).toBeNull();
    expect(normalizeMarkImportedWarning({ status: 'failed', error: 'refused', at: 'x' })).toEqual({
      status: 'failed',
      error: 'refused',
    });
  });
});

describe('MarkImportedControl', () => {
  it('shows the label field only when on, with Odly as the default', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MarkImportedControl value={{ enabled: false }} onChange={onChange} />
    );
    expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
    fireEvent.click(toggle());
    expect(onChange).toHaveBeenCalledWith({ enabled: true });

    rerender(<MarkImportedControl value={{ enabled: true }} onChange={onChange} />);
    expect(screen.getByLabelText('Label')).toHaveAttribute('placeholder', 'Odly');
  });

  it('keeps what is typed, spaces included (trimmed only when saved)', () => {
    const onChange = vi.fn();
    render(<MarkImportedControl value={{ enabled: true, label: 'Handled' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Handled ' } });
    expect(onChange).toHaveBeenCalledWith({ enabled: true, label: 'Handled ' });
  });
});

describe('GmailMarkImportedStrip', () => {
  const props = { onRefresh: vi.fn(() => Promise.resolve()), onShowAlert: vi.fn() };

  it("today's grant (readonly + send): disabled, and says why", () => {
    render(
      <GmailMarkImportedStrip source={gmailSource({ grantedScopes: TODAY_GRANT })} {...props} />
    );
    expect(toggle()).toBeDisabled();
    expect(screen.getByText(/needs an extra gmail permission/i)).toBeInTheDocument();
  });

  it('with gmail.modify: turning it on and saving PATCHes config.gmail.markImported', async () => {
    render(
      <GmailMarkImportedStrip
        source={gmailSource({ grantedScopes: `${TODAY_GRANT} ${MODIFY}` })}
        {...props}
      />
    );
    fireEvent.click(toggle());
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: ' Odly done ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(9, {
        type: 'gmail',
        config: { gmail: { markImported: { enabled: true, label: 'Odly done' } } },
      })
    );
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('a stored "on" can still be turned off without the grant', () => {
    render(
      <GmailMarkImportedStrip
        source={gmailSource({ grantedScopes: TODAY_GRANT, markImported: { enabled: true } })}
        {...props}
      />
    );
    expect(toggle()).toBeEnabled();
  });

  it('turning a stored "on" off saves enabled: false and keeps the label for next time', async () => {
    render(
      <GmailMarkImportedStrip
        source={gmailSource({
          grantedScopes: TODAY_GRANT,
          markImported: { enabled: true, label: 'Odly' },
        })}
        {...props}
      />
    );
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(9, {
        type: 'gmail',
        config: { gmail: { markImported: { enabled: false, label: 'Odly' } } },
      })
    );
  });

  it('a refused save says "Not saved"', async () => {
    update.mockRejectedValueOnce(new Error('boom'));
    const onShowAlert = vi.fn();
    render(
      <GmailMarkImportedStrip
        source={gmailSource({ grantedScopes: `${TODAY_GRANT} ${MODIFY}` })}
        onRefresh={vi.fn(() => Promise.resolve())}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onShowAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not saved' }))
    );
  });

  it('a save that landed but whose list refresh failed does NOT say "Not saved"', async () => {
    const onShowAlert = vi.fn();
    render(
      <GmailMarkImportedStrip
        source={gmailSource({ grantedScopes: `${TODAY_GRANT} ${MODIFY}` })}
        onRefresh={vi.fn(() => Promise.reject(new Error('list down')))}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(onShowAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Saved', variant: 'warning' })
    );
    expect(onShowAlert).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Not saved' }));
  });

  it('follows the stored value when it changes (no stale Save that would write it back)', () => {
    const grant = `${TODAY_GRANT} ${MODIFY}`;
    const { rerender } = render(
      <GmailMarkImportedStrip source={gmailSource({ grantedScopes: grant })} {...props} />
    );
    rerender(
      <GmailMarkImportedStrip
        source={gmailSource({
          grantedScopes: grant,
          markImported: { enabled: true, label: 'New' },
        })}
        {...props}
      />
    );
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Label')).toHaveValue('New');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('the switch is described by the note (why it is disabled)', () => {
    render(
      <GmailMarkImportedStrip source={gmailSource({ grantedScopes: TODAY_GRANT })} {...props} />
    );
    expect(toggle()).toHaveAccessibleDescription(/needs an extra gmail permission/i);
  });

  it('no Save button until something changed', () => {
    render(
      <GmailMarkImportedStrip
        source={gmailSource({ grantedScopes: `${TODAY_GRANT} ${MODIFY}` })}
        {...props}
      />
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});

describe('SourceRowBadges — mark-imported warning', () => {
  it('a failed write shows "Not marked read"', () => {
    render(
      <SourceRowBadges source={{ markImportedWarning: { status: 'failed', error: 'refused' } }} />
    );
    expect(screen.getByText('Not marked read')).toBeInTheDocument();
  });

  it('a server without labels shows "No label"', () => {
    render(<SourceRowBadges source={{ markImportedWarning: { status: 'label_unsupported' } }} />);
    expect(screen.getByText('No label')).toBeInTheDocument();
  });

  it('nothing to report renders nothing', () => {
    render(<SourceRowBadges source={{ markImportedWarning: null }} />);
    expect(screen.queryByText('Not marked read')).not.toBeInTheDocument();
    expect(screen.queryByText('No label')).not.toBeInTheDocument();
  });
});
