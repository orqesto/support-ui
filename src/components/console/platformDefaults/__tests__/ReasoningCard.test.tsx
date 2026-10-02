import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import {
  normalizeReasoning,
  type PlatformReasoning,
  type ReasoningInput,
} from '@/services/platformSettings.service';

type Callbacks = { onSuccess?: () => void; onError?: (error: unknown) => void };

/**
 * The mutation stand-in. By default a save settles at once; `holdNext` keeps the callbacks so a
 * test can change the form while the request is in flight and settle it afterwards.
 */
const calls: { input: ReasoningInput; callbacks: Callbacks }[] = [];
let hold = false;
const mutation = {
  isPending: false,
  mutate: vi.fn((input: ReasoningInput, callbacks: Callbacks) => {
    calls.push({ input, callbacks });
    if (!hold) callbacks.onSuccess?.();
  }),
};

vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformReasoning: () => mutation,
  useIsSavingPlatformReasoning: () => mutation.isPending,
}));

const { ReasoningCard } = await import('../ReasoningCard');

const OPTIONS: PlatformReasoning['options'] = {
  efforts: ['none', 'minimal', 'low', 'medium', 'high'],
  features: ['translation', 'spam_detection', 'language_detection', 'brand_new_feature'],
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

const STORED = reasoningWith({
  defaultEffort: 'low',
  effortByFeature: { translation: 'medium' },
  headroomTokens: 5000,
});

const card = () => {
  const element = document.querySelector<HTMLElement>('[data-config-card="AI reasoning"]');
  if (!element) throw new Error('no AI reasoning card');
  return within(element);
};
const openEditor = () =>
  fireEvent.click(card().getByRole('button', { name: /^(edit|configure reasoning)$/i }));
const select = (label: string) => card().getByLabelText<HTMLSelectElement>(label);
const headroomInput = () => card().getByLabelText<HTMLInputElement>(/reasoning headroom/i);
const pressSave = () =>
  fireEvent.click(card().getByRole('button', { name: /save reasoning settings/i }));

const apiError = (status: number, data: { error: string } & Record<string, unknown>) =>
  Object.assign(new Error(data.error), { status, data });

beforeEach(() => {
  calls.length = 0;
  hold = false;
  mutation.mutate.mockClear();
});
afterEach(cleanup);

describe('ReasoningCard', () => {
  it('shows the stored levels and where the headroom comes from', () => {
    render(<ReasoningCard reasoning={STORED} />);
    const view = card();
    expect(view.getByText('Default level').nextElementSibling?.textContent).toMatch(/^Low/);
    expect(view.getByText('Translation').nextElementSibling?.textContent).toMatch(/^Medium/);
    const headroom = view.getByText('Reasoning headroom').nextElementSibling?.textContent;
    expect(headroom).toBe('5000 tokensset here');
  });

  it('says the headroom is the built-in default when nothing is saved for it', () => {
    render(<ReasoningCard reasoning={reasoningWith({ defaultEffort: 'low' })} />);
    const headroom = card().getByText('Reasoning headroom').nextElementSibling?.textContent;
    expect(headroom).toBe('3000 tokensbuilt-in default');
  });

  it('names the health-check feature truthfully and marks a feature with no AI calls', () => {
    render(
      <ReasoningCard
        reasoning={{
          ...STORED,
          options: { ...OPTIONS, features: ['other', 'landing_assistant', 'translation'] },
        }}
      />
    );
    openEditor();
    expect(select('Other (provider health checks)')).toBeTruthy();
    expect(card().getByText('Website assistant').textContent).toBe(
      'Website assistant(no AI calls yet)'
    );
    expect(card().getByText('Translation').textContent).toBe('Translation');
    expect(card().getByText(/and by calls that do not name a feature/i)).toBeTruthy();
  });

  it('names the model variants that never receive a level, as the backend rules do', () => {
    render(<ReasoningCard reasoning={STORED} />);
    const copy = card().getByText(/Levels are sent only to GPT-5 models/).textContent ?? '';
    expect(copy).toContain('o-series models (o1, o3, o3-mini, o4-mini)');
    expect(copy).toContain('to o1-mini or o1-preview');
    expect(copy).toContain('any chat, pro, search, codex or deep-research variant');
    expect(copy).toContain('or on requests that carry tools');
  });

  it('opens the editor on the stored values, with readable feature names', () => {
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    expect(select('Default level').value).toBe('low');
    expect(select('Translation').value).toBe('medium');
    expect(select('Spam detection').value).toBe('');
    // An id this build has no name for is still listed, under its own name.
    expect(select('brand_new_feature').value).toBe('');
    expect(headroomInput().value).toBe('5000');
  });

  it('saves the complete object, leaving out features on the default level', () => {
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    fireEvent.change(select('Spam detection'), { target: { value: 'minimal' } });
    fireEvent.change(select('Translation'), { target: { value: '' } });
    fireEvent.change(select('Language detection'), { target: { value: 'none' } });
    pressSave();
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toStrictEqual({
      defaultEffort: 'low',
      effortByFeature: { spam_detection: 'minimal', language_detection: 'none' },
      headroomTokens: 5000,
    });
  });

  it('saves {} when every value is back on its default', () => {
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    fireEvent.change(select('Default level'), { target: { value: '' } });
    fireEvent.change(select('Translation'), { target: { value: '' } });
    fireEvent.change(headroomInput(), { target: { value: '' } });
    pressSave();
    expect(calls[0].input).toStrictEqual({});
  });

  it('Reset saves {} only after the confirmation', () => {
    render(<ReasoningCard reasoning={STORED} />);
    fireEvent.click(card().getByRole('button', { name: /^reset$/i }));
    expect(mutation.mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^reset$/i }));
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toStrictEqual({});
  });

  it('a failed Reset says so, and the message does not follow into a fresh edit', () => {
    hold = true;
    render(<ReasoningCard reasoning={STORED} />);
    fireEvent.click(card().getByRole('button', { name: /^reset$/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^reset$/i }));
    act(() =>
      calls[0].callbacks.onError?.(apiError(403, { error: 'Role required', code: 'ROLE_REQUIRED' }))
    );
    expect(card().getByText(/not allowed to edit platform settings/i)).toBeTruthy();
    openEditor();
    expect(card().queryByText(/not allowed to edit platform settings/i)).toBeNull();
  });

  it('CONTROL: cancelling the Reset confirmation saves nothing', () => {
    render(<ReasoningCard reasoning={STORED} />);
    fireEvent.click(card().getByRole('button', { name: /^reset$/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('names the fields a 400 rejected, and keeps the editor open', () => {
    hold = true;
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    pressSave();
    act(() =>
      calls[0].callbacks.onError?.(
        apiError(400, {
          error: 'Validation error',
          code: 'VALIDATION_FAILED',
          fields: ['effortByFeature.translation', 'headroomTokens', '_', ''],
        })
      )
    );
    expect(
      card().getByText(
        'The server rejected these values, so nothing was saved: Translation level, Reasoning headroom.'
      )
    ).toBeTruthy();
    expect(select('Translation')).toBeTruthy();
  });

  it('says a 403 is a permission problem', () => {
    hold = true;
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    pressSave();
    act(() =>
      calls[0].callbacks.onError?.(apiError(403, { error: 'Role required', code: 'ROLE_REQUIRED' }))
    );
    expect(card().getByText(/not allowed to edit platform settings/i)).toBeTruthy();
  });

  it('a successful save returns to the read-only view', () => {
    hold = true;
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    fireEvent.change(select('Spam detection'), { target: { value: 'low' } });
    pressSave();
    act(() => calls[0].callbacks.onSuccess?.());
    expect(card().queryByLabelText('Spam detection')).toBeNull();
    expect(card().getByRole('button', { name: /^edit$/i })).toBeTruthy();
  });

  it('a refetch with new stored values does not overwrite edits in progress', () => {
    const { rerender } = render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    fireEvent.change(select('Spam detection'), { target: { value: 'high' } });
    rerender(<ReasoningCard reasoning={reasoningWith({ defaultEffort: 'medium' })} />);
    expect(select('Spam detection').value).toBe('high');
    expect(select('Default level').value).toBe('low');
    expect(card().getByText(/saved values changed on the server/i)).toBeTruthy();
  });

  it('CONTROL: an untouched form follows a refetch with new stored values', () => {
    const { rerender } = render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    rerender(<ReasoningCard reasoning={reasoningWith({ defaultEffort: 'medium' })} />);
    expect(select('Default level').value).toBe('medium');
    expect(select('Translation').value).toBe('');
    expect(card().queryByText(/saved values changed on the server/i)).toBeNull();
  });

  it('lists stored features the server ignores, and a save leaves them out', () => {
    render(
      <ReasoningCard
        reasoning={{
          // The backend's shape: `stored` is the usable part only; the rest is reported.
          ...reasoningWith({ effortByFeature: { translation: 'low' } }),
          ignoredFeatures: ['old_feature'],
        }}
      />
    );
    expect(
      card().getByText("Saved level for old_feature isn't a feature this server knows, and is ignored.")
    ).toBeTruthy();
    openEditor();
    // The ignored key must not make the untouched form look edited, nor travel with a save.
    pressSave();
    expect(calls[0].input).toStrictEqual({ effortByFeature: { translation: 'low' } });
    expect(card().queryByText(/saved values changed on the server/i)).toBeNull();
  });

  it('an untouched form with ignored features still follows a refetch', () => {
    const withIgnored = (translation: string): PlatformReasoning => ({
      ...reasoningWith({ effortByFeature: { translation } }),
      ignoredFeatures: ['old_feature'],
    });
    const { rerender } = render(<ReasoningCard reasoning={withIgnored('low')} />);
    openEditor();
    rerender(<ReasoningCard reasoning={withIgnored('medium')} />);
    expect(select('Translation').value).toBe('medium');
    expect(card().queryByText(/saved values changed on the server/i)).toBeNull();
  });

  it('CONTROL: no notice about unusable values when the server reports none', () => {
    render(<ReasoningCard reasoning={STORED} />);
    expect(card().queryByText(/is ignored|is used\./i)).toBeNull();
    expect(card().queryByText(/drops the ignored entries/i)).toBeNull();
  });

  const WITH_PROBLEMS: PlatformReasoning = {
    ...reasoningWith({ effortByFeature: { spam_detection: 'low' }, headroomTokens: 1000 }),
    ignoredFeatures: ['old_feature'],
    ignoredFields: ['defaultEffort', 'effortByFeature.translation'],
    adjustedFields: [{ field: 'headroomTokens', stored: 0, used: 1000 }],
  };

  it('VERSION SKEW: a stored effort or feature missing from options is neither shown nor sent', () => {
    render(
      <ReasoningCard
        reasoning={reasoningWith({
          defaultEffort: 'extreme',
          effortByFeature: { translation: 'ultra', gone_feature: 'low', spam_detection: 'low' },
        })}
      />
    );
    expect(card().queryByText('gone_feature')).toBeNull();
    openEditor();
    pressSave();
    expect(calls[0].input).toStrictEqual({ effortByFeature: { spam_detection: 'low' } });
  });

  it('lists a repeated problem once', () => {
    render(
      <ReasoningCard
        reasoning={{ ...reasoningWith({}), ignoredFields: ['defaultEffort', 'defaultEffort'] }}
      />
    );
    expect(
      card().getAllByText("Saved value for Default level isn't valid on this server and is ignored.")
    ).toHaveLength(1);
  });

  it('lists ignored fields and adjusted values in plain words', () => {
    render(<ReasoningCard reasoning={WITH_PROBLEMS} />);
    const view = card();
    expect(view.getByText("Saved value for Default level isn't valid on this server and is ignored.")).toBeTruthy();
    expect(
      view.getByText("Saved value for Translation level isn't valid on this server and is ignored.")
    ).toBeTruthy();
    expect(view.getByText('Headroom 0 is below the minimum; 1000 is used.')).toBeTruthy();
    expect(view.getByText("Saved level for old_feature isn't a feature this server knows, and is ignored.")).toBeTruthy();
    expect(view.getByText(/next save or Reset drops the ignored entries/i)).toBeTruthy();
  });

  it('says an adjustment above the maximum as such', () => {
    render(
      <ReasoningCard
        reasoning={{
          ...reasoningWith({ headroomTokens: 32000 }),
          adjustedFields: [{ field: 'headroomTokens', stored: 50000, used: 32000 }],
        }}
      />
    );
    expect(card().getByText('Headroom 50000 is above the maximum; 32000 is used.')).toBeTruthy();
  });

  it('warns in the editor before saving, and the save sends only the usable values', () => {
    render(<ReasoningCard reasoning={WITH_PROBLEMS} />);
    openEditor();
    expect(card().getByText(/saving will drop the ignored entries/i)).toBeTruthy();
    pressSave();
    expect(calls[0].input).toStrictEqual({
      effortByFeature: { spam_detection: 'low' },
      headroomTokens: 1000,
    });
  });

  it('a row holding only unusable parts is still offered a Reset', () => {
    render(
      <ReasoningCard
        reasoning={{ ...reasoningWith({}), ignoredFields: ['defaultEffort'] }}
      />
    );
    expect(card().getByRole('button', { name: /^reset$/i })).toBeTruthy();
  });

  it('CONTROL: an empty row with nothing unusable offers no Reset', () => {
    render(<ReasoningCard reasoning={reasoningWith({})} />);
    expect(card().queryByRole('button', { name: /^reset$/i })).toBeNull();
  });

  it('a save leaves out a saved level the server reports as not valid', () => {
    render(
      <ReasoningCard
        reasoning={{
          ...reasoningWith({ effortByFeature: { translation: 'low' } }),
          ignoredFields: ['defaultEffort'],
        }}
      />
    );
    openEditor();
    pressSave();
    expect(calls[0].input).toStrictEqual({ effortByFeature: { translation: 'low' } });
  });

  it.each(['8,000', '3 000', 'abc', '-', '1e'])(
    'refuses headroom text that is not a whole number (%s) instead of dropping the stored value',
    (typed) => {
      render(<ReasoningCard reasoning={STORED} />);
      openEditor();
      fireEvent.change(headroomInput(), { target: { value: typed } });
      expect(card().getByText('Enter a whole number from 1000 to 32000.')).toBeTruthy();
      pressSave();
      expect(mutation.mutate).not.toHaveBeenCalled();
    }
  );

  it('CONTROL: clearing the headroom on purpose saves without it (built-in default)', () => {
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    fireEvent.change(headroomInput(), { target: { value: '' } });
    pressSave();
    expect(calls[0].input).toStrictEqual({
      defaultEffort: 'low',
      effortByFeature: { translation: 'medium' },
    });
  });

  it('links the headroom error to the field for screen readers', () => {
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    expect(headroomInput().getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(headroomInput(), { target: { value: '999' } });
    const input = headroomInput();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe(
      'Enter a whole number from 1000 to 32000.'
    );
  });

  it('refuses a headroom below the server minimum', () => {
    render(<ReasoningCard reasoning={STORED} />);
    openEditor();
    fireEvent.change(headroomInput(), { target: { value: '999' } });
    expect(card().getByText('Enter a whole number from 1000 to 32000.')).toBeTruthy();
    pressSave();
    expect(mutation.mutate).not.toHaveBeenCalled();
    fireEvent.change(headroomInput(), { target: { value: '1000' } });
    pressSave();
    expect(calls[0].input.headroomTokens).toBe(1000);
  });

  it('warns when a level is High and the headroom is not above the default', () => {
    render(<ReasoningCard reasoning={reasoningWith({ effortByFeature: { translation: 'high' } })} />);
    expect(card().getByText(/set to High while the headroom is 3000 tokens/i)).toBeTruthy();
  });

  it('warns in the editor as High is chosen, and stops once the headroom is raised', () => {
    render(<ReasoningCard reasoning={STORED} />);
    // STORED: low / medium, headroom 5000 — no warning.
    expect(card().queryByText(/set to High/i)).toBeNull();
    openEditor();
    fireEvent.change(select('Default level'), { target: { value: 'high' } });
    fireEvent.change(headroomInput(), { target: { value: '3000' } });
    expect(card().getByText(/set to High while the headroom is 3000 tokens/i)).toBeTruthy();
    fireEvent.change(headroomInput(), { target: { value: '3001' } });
    expect(card().queryByText(/set to High/i)).toBeNull();
  });

  it('says the setting is not available when the backend does not report it', () => {
    render(<ReasoningCard reasoning={undefined} />);
    expect(card().getByText(/not available on this server/i)).toBeTruthy();
    expect(card().queryByRole('button')).toBeNull();
  });
});

describe('normalizeReasoning (version skew)', () => {
  it('returns undefined for an absent or unreadable block', () => {
    expect(normalizeReasoning(undefined)).toBeUndefined();
    expect(normalizeReasoning({ stored: {}, effective: {} })).toBeUndefined();
    expect(
      normalizeReasoning({ stored: {}, options: { efforts: 'low', features: [] } })
    ).toBeUndefined();
    // Bounds present, so only the malformed effort list can be what refuses it.
    expect(
      normalizeReasoning({
        stored: {},
        options: { efforts: 'low', features: [], headroomTokens: OPTIONS.headroomTokens },
      })
    ).toBeUndefined();
  });

  it('CONTROL: reads the block the backend sends', () => {
    const raw = {
      stored: { defaultEffort: 'low' },
      effective: {
        defaultEffort: 'low',
        effortByFeature: {},
        headroomTokens: { value: 3000, source: 'default' },
      },
      options: OPTIONS,
    };
    expect(normalizeReasoning(raw)).toStrictEqual({
      stored: { defaultEffort: 'low' },
      effective: raw.effective,
      options: OPTIONS,
      ignoredFeatures: [],
      ignoredFields: [],
      adjustedFields: [],
    });
    expect(
      normalizeReasoning({
        ...raw,
        ignoredFields: ['defaultEffort'],
        adjustedFields: [
          { field: 'headroomTokens', stored: 0, used: 1000 },
          { stored: 1 },
          'junk',
          { field: 'headroomTokens', stored: 'x', used: 1000 },
        ],
      })
    ).toMatchObject({
      ignoredFields: ['defaultEffort'],
      adjustedFields: [
        { field: 'headroomTokens', stored: 0, used: 1000 },
        { field: 'headroomTokens', stored: null, used: 1000 },
      ],
    });
    expect(normalizeReasoning({ ...raw, ignoredFeatures: ['old_feature'] })?.ignoredFeatures).toEqual([
      'old_feature',
    ]);
  });
});
