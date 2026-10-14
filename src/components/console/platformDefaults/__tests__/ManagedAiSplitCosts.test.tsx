import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  normalizeSplitCosts,
  type PlatformSettings,
  type ResolvedField,
  type SecretStatus,
} from '@/services/platformSettings.service';

const noopMutation = { mutate: vi.fn(), isPending: false };
const saveMutation = {
  mutate: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  isPending: false,
};
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { bedrockInstanceProfile: false }, isLoading: false }),
}));
vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformAi: () => saveMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
  usePlatformBedrockModels: () => ({ data: undefined, isLoading: false }),
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
}));

const { ManagedAiDefaultsCard } = await import('../ManagedAiDefaultsCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };
const NOT_SET: ResolvedField<number> = { value: null, source: 'default' };

type Ai = PlatformSettings['ai'];

/** What an OLDER backend sends: blended per-1k rates only, no split fields. */
const legacyAi = (): Ai => ({
  provider: { value: 'openai', source: 'db' },
  defaultModel: { value: 'gpt-5-mini', source: 'db' },
  strongModel: { value: 'gpt-5', source: 'db' },
  visionModel: { value: 'gpt-4o-mini', source: 'db' },
  defaultCostPer1k: { value: 0.00013, source: 'db' },
  strongCostPer1k: { value: 0.0008, source: 'db' },
  visionCostPer1k: { value: 0.002, source: 'env' },
  baseUrl: { value: 'https://api.openai.com/v1', source: 'default' },
  organization: { value: '', source: 'default' },
  bedrockRegion: { value: null, source: 'default' },
  bedrockRoleArn: { value: null, source: 'default' },
  bedrockExternalId: { value: null, source: 'default' },
  bedrockUseInstanceProfile: { value: null, source: 'default' },
  bedrockInferenceProfileArn: { value: null, source: 'default' },
  keySlot: 'ai.openai_api_key',
  baseUrlEditable: false,
  apiKey: UNSET,
  bedrockAccessKeyId: UNSET,
  bedrockSecretAccessKey: UNSET,
});

/** A backend with split rates: the default tier has a stored pair, the others none. */
const splitAi = (): Ai => ({
  ...legacyAi(),
  defaultCostPer1k: NOT_SET,
  defaultInputPer1M: { value: 0.1, source: 'db' },
  defaultOutputPer1M: { value: 0.5, source: 'db' },
  strongInputPer1M: NOT_SET,
  strongOutputPer1M: NOT_SET,
  visionInputPer1M: NOT_SET,
  visionOutputPer1M: NOT_SET,
  splitCostsSupported: true,
});

const SECRETS = {
  'ai.openai_api_key': UNSET,
  'ai.anthropic_api_key': UNSET,
  'ai.deepseek_api_key': UNSET,
  'ai.perplexity_api_key': UNSET,
  'ai.qwen_api_key': UNSET,
  'ai.custom_api_key': UNSET,
  'ai.bedrock_access_key_id': UNSET,
  'ai.bedrock_secret_access_key': UNSET,
  'storage.s3_access_key_id': UNSET,
  'storage.s3_secret_access_key': UNSET,
} satisfies PlatformSettings['secrets'];

const rate = (tier: string, side: 'input' | 'output') =>
  screen.getByLabelText<HTMLInputElement>(`${tier} — ${side} $ per 1M tokens`);
const openEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(edit|configure)/i }));
const saveButton = () => screen.getByRole('button', { name: /save ai defaults/i });
const sentInput = () => saveMutation.mutate.mock.lastCall?.[0] as Record<string, unknown>;

afterEach(() => {
  cleanup();
  saveMutation.mutate.mockClear();
});

describe('normalizeSplitCosts', () => {
  it('reports split support only when all six fields arrive', () => {
    const all = {
      defaultInputPer1M: { value: 0.1, source: 'db' },
      defaultOutputPer1M: { value: 0.5, source: 'db' },
      strongInputPer1M: { value: null, source: 'default' },
      strongOutputPer1M: { value: null, source: 'default' },
      visionInputPer1M: { value: null, source: 'default' },
      visionOutputPer1M: { value: null, source: 'default' },
    };
    expect(normalizeSplitCosts(all)).toMatchObject({
      splitCostsSupported: true,
      defaultInputPer1M: { value: 0.1, source: 'db' },
    });
    expect(normalizeSplitCosts({})).toEqual({});
    const { visionOutputPer1M: _dropped, ...five } = all;
    expect(normalizeSplitCosts(five)).toEqual({});
  });
});

describe('ManagedAiDefaultsCard — split input/output rates', () => {
  it('shows two inputs per tier and no unit picker', () => {
    render(<ManagedAiDefaultsCard ai={splitAi()} secrets={SECRETS} />);
    openEditor();
    expect(rate('Default tier', 'input').value).toBe('0.1');
    expect(rate('Default tier', 'output').value).toBe('0.5');
    expect(rate('Strong tier', 'input').value).toBe('');
    expect(rate('Vision tier', 'output').value).toBe('');
    expect(screen.queryByRole('combobox', { name: 'Cost unit' })).toBeNull();
    expect(screen.queryByLabelText(/cost per 1M tokens/)).toBeNull();
  });

  it('saves the split pair and not that tier’s blended rate', () => {
    // The strong tier still holds a stored blended rate; a typed pair supersedes it.
    render(<ManagedAiDefaultsCard ai={splitAi()} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(rate('Strong tier', 'input'), { target: { value: '1.25' } });
    fireEvent.change(rate('Strong tier', 'output'), { target: { value: '10' } });
    fireEvent.click(saveButton());

    expect(sentInput()).toMatchObject({
      defaultInputPer1M: 0.1,
      defaultOutputPer1M: 0.5,
      strongInputPer1M: 1.25,
      strongOutputPer1M: 10,
    });
    expect(sentInput()).not.toHaveProperty('strongCostPer1k');
    expect(sentInput()).not.toHaveProperty('defaultCostPer1k');
  });

  it('a blank tier resends its stored console blended rate unchanged', () => {
    render(<ManagedAiDefaultsCard ai={splitAi()} secrets={SECRETS} />);
    openEditor();
    fireEvent.click(saveButton());

    // Console (db) blended rate kept; an env one is not this form's to write.
    expect(sentInput()).toMatchObject({ strongCostPer1k: 0.0008 });
    expect(sentInput()).not.toHaveProperty('visionCostPer1k');
    expect(sentInput()).not.toHaveProperty('strongInputPer1M');
    expect(sentInput()).not.toHaveProperty('strongOutputPer1M');
  });

  it('exactly one of the pair blocks Save with an inline error', () => {
    render(<ManagedAiDefaultsCard ai={splitAi()} secrets={SECRETS} />);
    openEditor();
    fireEvent.change(rate('Vision tier', 'input'), { target: { value: '0.3' } });

    expect(screen.getByText('Set both input and output, or neither.')).toBeTruthy();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(saveMutation.mutate).not.toHaveBeenCalled();

    fireEvent.change(rate('Vision tier', 'output'), { target: { value: '1.2' } });
    expect(screen.queryByText('Set both input and output, or neither.')).toBeNull();
    fireEvent.click(saveButton());
    expect(sentInput()).toMatchObject({ visionInputPer1M: 0.3, visionOutputPer1M: 1.2 });
  });

  it('the read-only summary shows in · out for a split tier and blended for the rest', () => {
    render(<ManagedAiDefaultsCard ai={splitAi()} secrets={SECRETS} />);
    expect(screen.getByText('Default tier cost (per 1M tokens)')).toBeTruthy();
    expect(screen.getByText('in 0.1 · out 0.5')).toBeTruthy();
    expect(screen.getByText('Strong tier cost / 1M tokens')).toBeTruthy();
    expect(screen.getByText('0.8')).toBeTruthy();
    expect(screen.queryByText('Default tier cost / 1M tokens')).toBeNull();
  });
});

describe('ManagedAiDefaultsCard — older backend without split rates', () => {
  it('keeps the blended inputs, the unit picker and the save payload', () => {
    render(<ManagedAiDefaultsCard ai={legacyAi()} secrets={SECRETS} />);
    openEditor();
    expect(screen.getByRole('combobox', { name: 'Cost unit' })).toBeTruthy();
    expect(screen.queryByLabelText(/input \$ per 1M/)).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Default tier — cost per 1M tokens').value).toBe(
      '0.13'
    );

    fireEvent.click(saveButton());
    const sent = sentInput();
    expect(sent).toMatchObject({ defaultCostPer1k: 0.00013, strongCostPer1k: 0.0008 });
    expect(Object.keys(sent).filter((key) => /Per1M$/.test(key))).toEqual([]);
    expect(sent).not.toHaveProperty('visionCostPer1k');
  });

  it('summary keeps the blended rows', () => {
    render(<ManagedAiDefaultsCard ai={legacyAi()} secrets={SECRETS} />);
    expect(screen.getByText('Default tier cost / 1M tokens')).toBeTruthy();
    expect(screen.queryByText(/cost \(per 1M tokens\)/)).toBeNull();
  });
});
