import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type {
  RuleLibraryFlow,
  RuleLibraryItem,
  RuleLibraryList,
  RuleLibraryService,
} from '@/features/rule-library/services/ruleLibrary.service';
import { PLATFORM_SECTIONS } from '@/components/console/consoleSections';
import { apiError } from '@/test/apiError';

const item = (over: Partial<RuleLibraryItem> = {}): RuleLibraryItem => ({
  id: 1,
  flow: 'spam',
  seedKey: 'spam:baseline:Example',
  originPresetKey: 'baseline',
  name: 'Example rule',
  description: 'Catches an example',
  purposeGroup: 'general',
  payload: { pattern: 'win a prize', category: 'prize', severity: 50 },
  hasEmbedding: false,
  embeddingModel: null,
  source: 'seed',
  active: true,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
  updatedBy: null,
  ...over,
});
const counts = (over: Partial<Record<RuleLibraryFlow, number>> = {}): RuleLibraryList['countsByFlow'] => ({
  spam: 12,
  detection: 7,
  categories: 3,
  prompts: 0,
  contradiction: 0,
  kb_detection: 0,
  priority: 0,
  response: 103,
  routing: 0,
  sla: 0,
  auto_reply: 0,
  capability: 0,
  ...over,
});

// Typed against the real service: a renamed function or a changed shape fails type-check here.
const list = vi.fn<RuleLibraryService['listLibraryItems']>();
const get = vi.fn<RuleLibraryService['getLibraryItem']>();
const create = vi.fn<RuleLibraryService['createLibraryItem']>();
const update = vi.fn<RuleLibraryService['updateLibraryItem']>();
vi.mock('@/features/rule-library/services/ruleLibrary.service', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  listLibraryItems: (...args: Parameters<RuleLibraryService['listLibraryItems']>) => list(...args),
  getLibraryItem: (...args: Parameters<RuleLibraryService['getLibraryItem']>) => get(...args),
  createLibraryItem: (...args: Parameters<RuleLibraryService['createLibraryItem']>) => create(...args),
  updateLibraryItem: (...args: Parameters<RuleLibraryService['updateLibraryItem']>) => update(...args),
}));

let flags: Record<string, boolean> = {};
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    flags,
    loading: false,
    // A global admin: the staff preview must NOT lift this page's flag.
    canPreviewUnfinished: true,
    isSurfaceEnabled: (key: string) => flags[key] === true,
    isSurfaceVisibleToMe: () => true,
    isPreviewing: () => false,
  }),
}));

const { PlatformRuleLibrary } = await import('../PlatformRuleLibrary');
const renderPage = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PlatformRuleLibrary />
      </QueryClientProvider>
    </MemoryRouter>
  );

const body = (over: Partial<RuleLibraryList> = {}): RuleLibraryList => ({
  items: [item()],
  total: 1,
  page: 1,
  pageSize: 25,
  countsByFlow: counts(),
  ...over,
});

afterEach(cleanup);
beforeEach(() => {
  flags = { 'ui.rule_library_console': true };
  list.mockReset().mockResolvedValue(body());
  get.mockReset();
  create.mockReset();
  update.mockReset().mockResolvedValue(item());
});

const openEditor = async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  await screen.findByLabelText('Name');
};

describe('Rule library console: the flag', () => {
  it('has a nav entry that needs ui.rule_library_console', () => {
    const entry = PLATFORM_SECTIONS.find((section) => section.id === 'rule-library');
    expect(entry?.flag).toBe('ui.rule_library_console');
    // A control: other entries carry no flag, so the filter in AdminShell leaves them alone.
    expect(PLATFORM_SECTIONS.find((section) => section.id === 'audit')?.flag).toBeUndefined();
  });

  it('renders the page, not the unavailable state, when the flag is on', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Rule library' })).toBeTruthy();
    expect(list).toHaveBeenCalled();
  });

  it.each([
    ['off', { 'ui.rule_library_console': false }],
    ['absent', {}],
  ])('shows nothing of the page and loads nothing when the flag is %s, even for a global admin', (_n, value) => {
    flags = value;
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Rule library' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New item' })).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
});

describe('Rule library console: the page', () => {
  it('renders a tab per flow with its count', async () => {
    renderPage();
    const spam = await screen.findByRole('button', { name: /^Spam\s*12$/ });
    expect(spam).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Response\s*103$/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^(Spam|Detection|Categories|Prompts|Contradiction|KB detection|Priority|Response|Routing|SLA|Auto reply|Capability)\s*\d+$/ })).toHaveLength(12);
  });

  it('lists the row with the no-embedding badge', async () => {
    renderPage();
    expect(await screen.findByText('Example rule')).toBeTruthy();
    expect(screen.getByText('no embedding')).toBeTruthy();
  });

  it('asks for active rows by default and archived ones with the toggle', async () => {
    renderPage();
    await screen.findByText('Example rule');
    expect(list.mock.calls[0][0]).toMatchObject({ flow: 'spam', active: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Archived' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ active: false })));
    fireEvent.click(screen.getByRole('switch', { name: 'Missing description' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ missingDescription: true }))
    );
  });

  it('saves with updatedAt and keeps payload keys the field list does not know', async () => {
    list.mockResolvedValue(body({ items: [item({ payload: { pattern: 'p', category: 'c', severity: 5, extra: 1 } })] }));
    await openEditor();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New text' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'p2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const [id, sent] = update.mock.calls[0];
    expect(id).toBe(1);
    expect(sent).toMatchObject({ updatedAt: '2026-11-02T10:00:00Z', description: 'New text', active: true });
    expect(sent.payload).toMatchObject({ pattern: 'p2', category: 'c', severity: 5, extra: 1 });
    expect('flow' in sent).toBe(false);
  });

  it.each([
    ['a 409', 409, { success: false, error: 'stale', code: 'STALE_ITEM' }, 'Someone else changed this item — reload'],
    ['an unsafe pattern', 400, { success: false, error: 'x', code: 'UNSAFE_PATTERN' }, 'This pattern could hang mail processing'],
    ['a 503', 503, { success: false, error: 'x', code: 'EMBEDDING_UNAVAILABLE' }, "Could not compute the example's meaning; nothing saved"],
    ['a validation error', 400, { success: false, error: 'Invalid payload', code: 'VALIDATION_ERROR' }, 'Invalid payload'],
  ])('shows the right message for %s', async (_n, status, errBody, text) => {
    update.mockRejectedValue(await apiError(status, errBody));
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('lists each validation issue under the error', async () => {
    update.mockRejectedValue(
      await apiError(400, {
        success: false,
        error: 'Invalid payload',
        code: 'VALIDATION_ERROR',
        issues: [{ path: ['severity'], message: 'Number must be less than or equal to 100' }],
      })
    );
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('severity: Number must be less than or equal to 100')).toBeTruthy();
  });

  it('reloads the list after a stale-item error', async () => {
    update.mockRejectedValue(await apiError(409, { success: false, error: 'stale', code: 'STALE_ITEM' }));
    await openEditor();
    const before = list.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Someone else changed this item — reload');
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });

  it('clears a purpose group with null, and sends no payload for an unchanged one', async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText('Purpose group'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const sent = update.mock.calls[0][1];
    expect(sent.purposeGroup).toBeNull();
    expect('payload' in sent).toBe(false);
  });

  it('an active-only edit sends no payload', async () => {
    await openEditor();
    fireEvent.click(screen.getByRole('switch', { name: 'Active' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const sent = update.mock.calls[0][1];
    expect(sent).toMatchObject({ active: false, purposeGroup: 'general' });
    expect('payload' in sent).toBe(false);
  });

  it('a stored null contextConditions does not become a null on an unchanged save', async () => {
    list.mockResolvedValue(
      body({
        items: [
          item({
            flow: 'response',
            payload: {
              category: 'c', triggerType: 't', exampleText: 'e', responseTemplate: 'r',
              responseType: 'x', confidenceThreshold: 1, language: 'en', priority: 1,
              contextConditions: null,
            },
          }),
        ],
      })
    );
    await openEditor();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'd2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const sent = update.mock.calls[0][1];
    // Null and absent are the same: nothing changed in the payload, so none is sent (and no null goes out).
    expect('payload' in sent).toBe(false);
  });

  it('creates a new item after picking a flow', async () => {
    create.mockResolvedValue(item({ id: 9, flow: 'capability' }));
    renderPage();
    await screen.findByText('Example rule');
    fireEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(await screen.findByLabelText('Flow')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mine' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'cat' } });
    fireEvent.change(screen.getByLabelText('Severity (1-100)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      flow: 'spam',
      name: 'Mine',
      payload: { pattern: 'abc', category: 'cat', severity: 40 },
    });
  });
});
