import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, cleanup, fireEvent, within, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as PlatformSettingsModule from '@/services/platformSettings.service';

type PlatformReasoning = PlatformSettingsModule.PlatformReasoning;
type ReasoningInput = PlatformSettingsModule.ReasoningInput;

/**
 * The card against a REAL QueryClient and the real hooks — only the service is mocked.
 *
 * ⛔ The ordering these pin cannot be reproduced by calling mocked callbacks by hand: the per-call
 * onSuccess runs in microtasks, the query observer re-renders on a later tick.
 */
const OPTIONS: PlatformReasoning['options'] = {
  efforts: ['none', 'minimal', 'low', 'medium', 'high'],
  features: ['translation', 'spam_detection'],
  headroomTokens: { min: 1000, max: 32000, default: 3000 },
};
const reasoningWith = (stored: ReasoningInput): PlatformReasoning => ({
  stored,
  effective: {
    defaultEffort: stored.defaultEffort ?? null,
    effortByFeature: stored.effortByFeature ?? {},
    headroomTokens:
      stored.headroomTokens !== undefined
        ? { value: stored.headroomTokens, source: 'db' }
        : { value: 3000, source: 'default' },
  },
  options: OPTIONS,
  ignoredFeatures: [],
  ignoredFields: [],
  adjustedFields: [],
});

const INITIAL: ReasoningInput = { defaultEffort: 'low', headroomTokens: 5000 };
let server: ReasoningInput = INITIAL;
let failGet = false;
let deferGet = false;
let deferredGets: (() => void)[] = [];
let pendingSaves: { resolve: () => void; reject: (error: unknown) => void }[] = [];

const updateReasoning = vi.fn(
  (input: ReasoningInput) =>
    new Promise<undefined>((resolve, reject) => {
      pendingSaves.push({
        resolve: () => {
          server = input;
          resolve(undefined);
        },
        reject,
      });
    })
);
const models = vi.fn(() => Promise.resolve({}));
vi.mock('@/services/platformSettings.service', async (orig) => {
  const actual = await orig<typeof PlatformSettingsModule>();
  return {
    ...actual,
    platformSettingsService: {
      get: vi.fn(() => {
        if (failGet) return Promise.reject(new Error('network down'));
        const answer = () => ({ reasoning: reasoningWith(server), ai: {}, storage: {}, secrets: {} });
        if (deferGet) {
          return new Promise((resolve) => deferredGets.push(() => resolve(answer())));
        }
        return Promise.resolve(answer());
      }),
      models: () => models(),
      updateReasoning: (input: ReasoningInput) => updateReasoning(input),
    },
  };
});
// The page test is about what replaces the reasoning card; the sibling cards are not under test.
vi.mock('@/components/console/platformDefaults/ManagedAiDefaultsCard', () => ({
  ManagedAiDefaultsCard: () => null,
}));
vi.mock('@/components/console/platformDefaults/DefaultStorageCard', () => ({
  DefaultStorageCard: () => null,
}));

const toastFailure = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: { failure: toastFailure, success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const { usePlatformSettings, usePlatformAiModels } = await import('@/hooks/usePlatformSettings');
const { ReasoningCard } = await import('../ReasoningCard');
const { PlatformDefaults } = await import('@/pages/console/PlatformDefaults');

const Harness = () => {
  const query = usePlatformSettings();
  return query.data ? <ReasoningCard reasoning={query.data.reasoning} /> : null;
};
/** A mounted consumer of the ai-models catalog, which shares the settings key prefix. */
const ModelsConsumer = () => {
  usePlatformAiModels();
  return null;
};

let qc: QueryClient;
const mount = async (node: ReactNode = <Harness />) => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  await waitFor(() => card().getByRole('button', { name: /^edit$/i }));
  return view;
};
const card = () => {
  const element = document.querySelector<HTMLElement>('[data-config-card="AI reasoning"]');
  if (!element) throw new Error('no AI reasoning card');
  return within(element);
};
const select = (label: string) => card().getByLabelText<HTMLSelectElement>(label);
const edit = () => fireEvent.click(card().getByRole('button', { name: /^edit$/i }));
const pressSave = () =>
  fireEvent.click(card().getByRole('button', { name: /save reasoning settings/i }));
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));
/** Another admin stores `value`; this console refetches. */
const otherAdminSaves = async (value: ReasoningInput) => {
  server = value;
  await act(() => qc.invalidateQueries({ queryKey: ['platform', 'settings'], exact: true }));
  await settle();
};
const answerSave = async () => {
  await waitFor(() => expect(pendingSaves.length).toBeGreaterThan(0));
  const save = pendingSaves.shift();
  await act(() => Promise.resolve(save?.resolve()));
  await settle();
};
const pressReset = async () => {
  fireEvent.click(card().getByRole('button', { name: /^reset$/i }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^reset$/i }));
  await waitFor(() => expect(pendingSaves.length).toBe(1));
};
const MOVED = /saved values changed on the server/i;
const disabled = (element: HTMLElement) => (element as HTMLButtonElement).disabled;

beforeEach(() => {
  server = INITIAL;
  failGet = false;
  deferGet = false;
  deferredGets = [];
  pendingSaves = [];
  updateReasoning.mockClear();
  models.mockClear();
  toastFailure.mockClear();
});
afterEach(cleanup);

describe('ReasoningCard with a real QueryClient', () => {
  it('locks every field and action while a save is in flight, then lands read-only', async () => {
    await mount();
    edit();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    await waitFor(() => expect(pendingSaves.length).toBe(1));
    // Every control in the card: the three kinds of field plus Save (now labelled "Loading...") and Cancel.
    expect(disabled(select('Default level'))).toBe(true);
    expect(disabled(select('Spam detection'))).toBe(true);
    expect(disabled(select('Translation'))).toBe(true);
    expect(disabled(card().getByLabelText(/reasoning headroom/i))).toBe(true);
    expect(card().getAllByRole('button').every(disabled)).toBe(true);
    // Reverting to the seeded value mid-flight (audit P1) cannot happen: the change is refused.
    fireEvent.change(select('Spam detection'), { target: { value: '' } });
    await answerSave();
    expect(card().getByRole('button', { name: /^edit$/i })).toBeTruthy();
    expect(card().getByText('Spam detection').nextElementSibling?.textContent).toMatch(/^Low/);
    // Our own save arriving is not another admin's change.
    expect(card().queryByText(MOVED)).toBeNull();
  });

  it('locks Edit and Reset while a Reset is in flight (audit P11)', async () => {
    await mount();
    await pressReset();
    expect(disabled(card().getByRole('button', { name: /^edit$/i }))).toBe(true);
    // Reset reads "Loading..." while pending rather than "Reset"; every button is disabled.
    expect(card().getAllByRole('button').every(disabled)).toBe(true);
    edit();
    expect(card().queryByLabelText('Spam detection')).toBeNull();
    await answerSave();
    expect(server).toStrictEqual({});
    expect(card().getByRole('button', { name: /^configure reasoning$/i })).toBeTruthy();
  });

  it('stays locked until the refetch after the save has landed, not just the PATCH', async () => {
    await mount();
    edit();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    deferGet = true;
    await answerSave();
    // PATCH answered, refetch still out: an edit now would race the arriving value.
    expect(disabled(select('Spam detection'))).toBe(true);
    expect(card().getAllByRole('button').every(disabled)).toBe(true);
    deferGet = false;
    await act(() => Promise.resolve(deferredGets.forEach((answer) => answer())));
    await settle();
    expect(disabled(card().getByRole('button', { name: /^edit$/i }))).toBe(false);
  });

  it('a card remounted mid-save is locked too, and unlocks on the saved value with no alert', async () => {
    const view = await mount();
    edit();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    await waitFor(() => expect(pendingSaves.length).toBe(1));
    // Navigate away and back while the save is in flight: same QueryClient, a new card.
    view.unmount();
    render(
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    );
    await waitFor(() => card().getByRole('button', { name: /^edit$/i }));
    expect(disabled(card().getByRole('button', { name: /^edit$/i }))).toBe(true);
    await answerSave();
    expect(disabled(card().getByRole('button', { name: /^edit$/i }))).toBe(false);
    expect(card().getByText('Spam detection').nextElementSibling?.textContent).toMatch(/^Low/);
    edit();
    expect(select('Spam detection').value).toBe('low');
    expect(card().queryByText(MOVED)).toBeNull();
  });

  it('another admin saving exactly what my open draft holds raises no alert', async () => {
    await mount();
    edit();
    fireEvent.change(select('Translation'), { target: { value: 'none' } });
    await otherAdminSaves({ ...INITIAL, effortByFeature: { translation: 'none' } });
    expect(card().queryByText(MOVED)).toBeNull();
    expect(select('Translation').value).toBe('none');
  });

  it('CONTROL: once the save settles the controls are usable again', async () => {
    await mount();
    expect(disabled(card().getByRole('button', { name: /^edit$/i }))).toBe(false);
    edit();
    expect(disabled(select('Spam detection'))).toBe(false);
  });

  it('a different value arriving while I edit raises the alert and keeps my edits', async () => {
    await mount();
    edit();
    fireEvent.change(select('Translation'), { target: { value: 'none' } });
    await otherAdminSaves({ defaultEffort: 'high' });
    expect(card().getByText(MOVED)).toBeTruthy();
    expect(select('Translation').value).toBe('none');
  });

  it('save A, another admin saves B, I edit, they save A back: the alert shows', async () => {
    await mount();
    edit();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    await answerSave();
    const savedA = server;
    await otherAdminSaves({ defaultEffort: 'high' });
    edit();
    expect(select('Default level').value).toBe('high');
    fireEvent.change(select('Translation'), { target: { value: 'none' } });
    await otherAdminSaves(savedA);
    expect(card().getByText(MOVED)).toBeTruthy();
  });

  it('a save refetches only the settings, not the ai-models catalog', async () => {
    await mount(
      <>
        <Harness />
        <ModelsConsumer />
      </>
    );
    await waitFor(() => expect(models).toHaveBeenCalledTimes(1));
    edit();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    await answerSave();
    expect(models).toHaveBeenCalledTimes(1);
  });

  it('on the page, a refetch failing after a successful save shows the load failure, and Retry shows the saved value', async () => {
    await mount(<PlatformDefaults />);
    edit();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    failGet = true;
    await answerSave();
    expect(screen.getByText(/failed to load platform defaults/i)).toBeTruthy();
    expect(document.querySelector('[data-config-card="AI reasoning"]')).toBeNull();
    failGet = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => card().getByRole('button', { name: /^edit$/i }));
    expect(card().getByText('Spam detection').nextElementSibling?.textContent).toMatch(/^Low/);
  });

  it('a double click on Save sends one save', async () => {
    await mount();
    edit();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    await settle();
    // In flight the Save button reads "Loading...", not its label; it is the first action button.
    fireEvent.click(card().getAllByRole('button')[0]);
    await settle();
    expect(updateReasoning).toHaveBeenCalledTimes(1);
  });

  it('a failure while the card is mounted is shown in the card, not toasted', async () => {
    await mount();
    edit();
    pressSave();
    await waitFor(() => expect(pendingSaves.length).toBe(1));
    await act(() =>
      Promise.resolve(
        pendingSaves[0].reject(Object.assign(new Error('nope'), { status: 403, data: {} }))
      )
    );
    await settle();
    expect(card().getByText(/not allowed to edit platform settings/i)).toBeTruthy();
    expect(toastFailure).not.toHaveBeenCalled();
  });

  it('a failure after the card unmounted is toasted', async () => {
    const view = await mount();
    edit();
    pressSave();
    await waitFor(() => expect(pendingSaves.length).toBe(1));
    view.unmount();
    await act(() =>
      Promise.resolve(
        pendingSaves[0].reject(Object.assign(new Error('nope'), { status: 500, data: {} }))
      )
    );
    await settle();
    expect(toastFailure).toHaveBeenCalledTimes(1);
    expect(toastFailure.mock.calls[0][0]).toBe('save the reasoning settings');
  });
});
