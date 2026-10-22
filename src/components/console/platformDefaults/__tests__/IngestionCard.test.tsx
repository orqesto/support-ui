/**
 * Platform Defaults → Mail import (2026-10-18): the import run budget and the two queue rates,
 * saved as a PARTIAL PUT /settings/ingestion. A backend without the block: no inputs, only why.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const puts: { url: string; body: unknown }[] = [];
let putError: Error | null = null;
const toastFailure = vi.fn<(scope: string, error: unknown) => void>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      if (putError) return Promise.reject(putError);
      return Promise.resolve({ data: { success: true } });
    },
    get: () => new Promise(() => undefined),
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: {
    failure: (scope: string, error: unknown) => toastFailure(scope, error),
    success: () => undefined,
  },
}));

const { IngestionCard, INGESTION_NOT_DEPLOYED } = await import('../IngestionCard');
const { normalizeIngestion } = await import('@/services/platformSettings.service');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const SETTING = {
  importRunBudgetMinutes: { value: 7, source: 'default' as const, min: 1, max: 30 },
  attachmentsPerMinute: { value: 30, source: 'db' as const, min: 5, max: 600 },
  kbMessagesPerMinute: { value: 40, source: 'default' as const, min: 5, max: 300 },
};
const GATE = {
  livePollCeilingUnits: { value: 6000, source: 'default' as const, min: 1500, max: 50000 },
  importPauseAtUnits: { value: 1500, source: 'default' as const, min: 300, max: 50000 },
  importResumeAtUnits: { value: 450, source: 'db' as const, min: 50, max: 49000 },
};
const ALL = { ...SETTING, ...GATE };
const pauseAt = () => screen.getByLabelText(/Pause imports at/);
const resumeAt = () => screen.getByLabelText(/Resume imports at/);
const ceiling = () => screen.getByLabelText(/New-mail checks pause at/);
const budget = () => screen.getByLabelText(/Import run budget/);
const attachments = () => screen.getByLabelText(/Attachments per minute/);
const kb = () => screen.getByLabelText(/Knowledge-base messages per minute/);
const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  puts.length = 0;
  putError = null;
  toastFailure.mockReset();
});
afterEach(cleanup);

describe('IngestionCard', () => {
  it('shows the saved values and where each comes from', () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    expect(budget()).toHaveValue(7);
    expect(attachments()).toHaveValue(30);
    expect(kb()).toHaveValue(40);
    expect(screen.getAllByText('Default')).toHaveLength(2);
    expect(screen.getAllByText('Console')).toHaveLength(1);
    expect(save()).toBeDisabled();
  });

  it('saves only the field that changed, with PUT /settings/ingestion', async () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    fireEvent.change(attachments(), { target: { value: '200' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/ingestion',
      body: { attachmentsPerMinute: 200 },
    });
  });

  it('two changed fields are sent together, the untouched one is not', async () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    fireEvent.change(budget(), { target: { value: '10' } });
    fireEvent.change(kb(), { target: { value: '60' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ importRunBudgetMinutes: 10, kbMessagesPerMinute: 60 });
  });

  it('a value outside the bounds, a fraction or blank: the bounds are said and nothing is sent', () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    for (const bad of ['4', '601', '1.5', '']) {
      fireEvent.change(attachments(), { target: { value: bad } });
      expect(screen.getByText('Enter a whole number from 5 to 600.')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    }
    fireEvent.change(attachments(), { target: { value: '5' } });
    expect(screen.queryByText(/Enter a whole number/)).toBeNull();
    expect(save()).toBeEnabled();
    expect(puts).toHaveLength(0);
  });

  it('a backend that has the budget but not the rates: only the budget is offered', () => {
    wrap(<IngestionCard ingestion={{ importRunBudgetMinutes: SETTING.importRunBudgetMinutes }} />);
    expect(budget()).toBeInTheDocument();
    expect(screen.queryByLabelText(/Attachments per minute/)).toBeNull();
    expect(screen.queryByLabelText(/Knowledge-base messages per minute/)).toBeNull();
  });

  it('no ingestion block (older backend): no inputs, says it arrives with the next release', () => {
    wrap(<IngestionCard ingestion={undefined} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(INGESTION_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('IngestionCard — when imports pause', () => {
  it('shows all six fields under a sub-heading, with their values', () => {
    wrap(<IngestionCard ingestion={ALL} />);
    expect(screen.getByText('When imports pause')).toBeInTheDocument();
    expect(pauseAt()).toHaveValue(1500);
    expect(resumeAt()).toHaveValue(450);
    expect(ceiling()).toHaveValue(6000);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(6);
  });

  it.each([
    ['pause', pauseAt, '2000', { importPauseAtUnits: 2000 }],
    ['resume', resumeAt, '400', { importResumeAtUnits: 400 }],
    ['ceiling', ceiling, '9000', { livePollCeilingUnits: 9000 }],
  ])('changing only %s sends only that field', async (_name, input, value, body) => {
    wrap(<IngestionCard ingestion={ALL} />);
    fireEvent.change(input(), { target: { value } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ url: '/api/admin/platform/settings/ingestion', body });
  });

  it('resume at or above pause is said and blocked', () => {
    wrap(<IngestionCard ingestion={ALL} />);
    fireEvent.change(resumeAt(), { target: { value: '1500' } });
    expect(screen.getByText('Must be lower than the pause value.')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(pauseAt(), { target: { value: '1600' } });
    expect(screen.queryByText('Must be lower than the pause value.')).toBeNull();
    expect(save()).toBeEnabled();
    expect(puts).toHaveLength(0);
  });

  it('ceiling below pause is said and blocked', () => {
    wrap(<IngestionCard ingestion={ALL} />);
    fireEvent.change(pauseAt(), { target: { value: '7000' } });
    expect(screen.getByText('Must not be lower than the pause value.')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(ceiling(), { target: { value: '7000' } });
    expect(screen.queryByText(/Must not be lower/)).toBeNull();
    expect(save()).toBeEnabled();
  });

  it("the server's 400 sentence is shown, and clears on the next edit", async () => {
    putError = Object.assign(new Error('Request failed'), {
      status: 400,
      data: { success: false, error: 'Resume must stay below the saved pause value.' },
    });
    wrap(<IngestionCard ingestion={ALL} />);
    fireEvent.change(ceiling(), { target: { value: '9000' } });
    fireEvent.click(save());
    expect(
      await screen.findByText('Resume must stay below the saved pause value.')
    ).toBeInTheDocument();
    fireEvent.change(ceiling(), { target: { value: '9500' } });
    expect(screen.queryByText('Resume must stay below the saved pause value.')).toBeNull();
  });

  it('a backend without the new fields: only the old three, no heading, no crash', () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3);
    expect(screen.queryByText('When imports pause')).toBeNull();
    expect(screen.queryByLabelText(/Pause imports at/)).toBeNull();
  });

  it('a backend with only the ceiling (live on staging first): it is offered alone', () => {
    wrap(
      <IngestionCard ingestion={{ ...SETTING, livePollCeilingUnits: GATE.livePollCeilingUnits }} />
    );
    expect(ceiling()).toHaveValue(6000);
    expect(screen.queryByLabelText(/Resume imports at/)).toBeNull();
    fireEvent.change(ceiling(), { target: { value: '8000' } });
    expect(save()).toBeEnabled();
  });
});

describe('normalizeIngestion', () => {
  it('keeps the fields that are whole numbers with whole bounds', () => {
    expect(normalizeIngestion(SETTING)).toEqual(SETTING);
  });

  it('drops a malformed field, keeps the rest; nothing usable is absent', () => {
    expect(
      normalizeIngestion({ ...SETTING, attachmentsPerMinute: { value: '30', source: 'db' } })
    ).toEqual({
      importRunBudgetMinutes: SETTING.importRunBudgetMinutes,
      kbMessagesPerMinute: SETTING.kbMessagesPerMinute,
    });
    expect(
      normalizeIngestion({ attachmentsPerMinute: { value: 5, source: 'db' } })
    ).toBeUndefined();
    expect(normalizeIngestion({})).toBeUndefined();
    expect(normalizeIngestion(undefined)).toBeUndefined();
    expect(normalizeIngestion([])).toBeUndefined();
  });

  it('keeps the three pause fields when present', () => {
    expect(normalizeIngestion(ALL)).toEqual(ALL);
  });

  it('an unknown source reads as the default', () => {
    expect(
      normalizeIngestion({ kbMessagesPerMinute: { value: 40, source: 'x', min: 5, max: 300 } })
        ?.kbMessagesPerMinute?.source
    ).toBe('default');
  });
});

const GMAIL = {
  attachmentRefetchPerRun: { value: 20, source: 'default' as const, min: 0, max: 200 },
  pacedUnitsPerMinute: { value: 12000, source: 'default' as const, min: 1000, max: 14000 },
  burstUnits: { value: 2000, source: 'db' as const, min: 100, max: 5000 },
  cooldownSeconds: { value: 30, source: 'default' as const, min: 5, max: 300 },
  bulkFetchMax: { value: 15, source: 'default' as const, min: 1, max: 30 },
  pollFetchMax: { value: 8, source: 'default' as const, min: 1, max: 30 },
};
const GMAIL_LABELS = [
  'Attachment refetch per check',
  'Gmail units per minute',
  'Gmail burst units',
  'Gmail cooldown after a refusal (seconds)',
  'Parallel fetches — import',
  'Parallel fetches — new mail',
];

describe('IngestionCard — Gmail', () => {
  it('shows the six Gmail fields under a Gmail heading', () => {
    wrap(<IngestionCard ingestion={{ ...SETTING, ...GMAIL }} />);
    expect(screen.getByRole('heading', { name: 'Gmail' })).toBeTruthy();
    for (const label of GMAIL_LABELS) expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it.each(Object.keys(GMAIL) as (keyof typeof GMAIL)[])('%s alone is offered alone', (key) => {
    wrap(<IngestionCard ingestion={{ ...SETTING, [key]: GMAIL[key] }} />);
    expect(screen.getAllByRole('spinbutton').length).toBe(Object.keys(SETTING).length + 1);
  });

  it('an older backend without them shows no Gmail heading', () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    expect(screen.queryByRole('heading', { name: 'Gmail' })).toBeNull();
  });

  it('saving sends only the changed Gmail field', async () => {
    wrap(<IngestionCard ingestion={{ ...SETTING, ...GMAIL }} />);
    fireEvent.change(screen.getByLabelText('Gmail units per minute'), {
      target: { value: '1000' },
    });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ pacedUnitsPerMinute: 1000 });
  });

  it('0 is allowed for the refetch (off)', async () => {
    wrap(<IngestionCard ingestion={{ ...SETTING, ...GMAIL }} />);
    fireEvent.change(screen.getByLabelText('Attachment refetch per check'), {
      target: { value: '0' },
    });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ attachmentRefetchPerRun: 0 });
  });

  it('units plus burst at or above 15,000 is said and blocked', () => {
    wrap(<IngestionCard ingestion={{ ...SETTING, ...GMAIL }} />);
    fireEvent.change(screen.getByLabelText('Gmail burst units'), { target: { value: '3000' } });
    expect(screen.getAllByText(/must stay below 15,000/)).toHaveLength(2);
    expect(save()).toBeDisabled();
  });

  it("the server's 400 sentence is shown", async () => {
    putError = Object.assign(new Error('Request failed'), {
      status: 400,
      data: { success: false, error: 'Units per minute plus burst must stay below 15000.' },
    });
    wrap(<IngestionCard ingestion={{ ...SETTING, ...GMAIL }} />);
    fireEvent.change(screen.getByLabelText('Parallel fetches — new mail'), {
      target: { value: '9' },
    });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(
      await screen.findByText('Units per minute plus burst must stay below 15000.')
    ).toBeInTheDocument();
  });
});

describe('normalizeIngestion — Gmail', () => {
  it('keeps the six fields, and drops one that is not a whole number', () => {
    expect(normalizeIngestion(GMAIL)).toEqual(GMAIL);
    expect(
      normalizeIngestion({
        ...GMAIL,
        burstUnits: { value: 1.5, source: 'db', min: 100, max: 5000 },
      })?.burstUnits
    ).toBeUndefined();
  });
});
