import { vi, describe, it, expect, afterEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import type * as platformSettingsModule from '@/services/platformSettings.service';

type PlatformSettings = platformSettingsModule.PlatformSettings;
type SecretStatus = platformSettingsModule.SecretStatus;

const testManagedAi = vi.fn();
vi.mock('@/services/platformSettings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof platformSettingsModule>();
  return {
    ...actual,
    platformSettingsService: { ...actual.platformSettingsService, testManagedAi },
  };
});

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
let saveSucceeds = true;
const saveMutation = {
  mutate: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => {
    if (saveSucceeds) opts?.onSuccess?.();
  }),
  isPending: false,
};
let instanceProfileAllowed = true;
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({
    data: { bedrockInstanceProfile: instanceProfileAllowed },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformAi: () => saveMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
  usePlatformAiModels: () => ({ data: undefined, isLoading: false }),
}));

const { ManagedAiDefaultsCard } = await import('../ManagedAiDefaultsCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };
const STORED = (last4: string): SecretStatus => ({ configured: true, source: 'db', last4 });

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

const PROFILE = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
const ROLE = 'arn:aws:iam::123456789012:role/OdlyBedrock';

/** taco's stored platform defaults as of 2026-09-30 (owner's screenshot). */
const bedrockAi = (over: Partial<PlatformSettings['ai']> = {}): PlatformSettings['ai'] => ({
  provider: { value: 'bedrock', source: 'db' },
  defaultModel: { value: 'anthropic.claude-haiku-4-5-20251001-v1:0', source: 'db' },
  strongModel: { value: 'anthropic.claude-haiku-4-5-20251001-v1:0', source: 'db' },
  visionModel: { value: null, source: 'default' },
  defaultCostPer1k: { value: null, source: 'default' },
  strongCostPer1k: { value: null, source: 'default' },
  visionCostPer1k: { value: null, source: 'default' },
  baseUrl: { value: null, source: 'default' },
  organization: { value: null, source: 'default' },
  bedrockRegion: { value: 'eu-west-1', source: 'db' },
  bedrockRoleArn: { value: null, source: 'default' },
  bedrockExternalId: { value: null, source: 'default' },
  bedrockUseInstanceProfile: { value: true, source: 'db' },
  bedrockInferenceProfileArn: { value: PROFILE, source: 'db' },
  keySlot: null,
  baseUrlEditable: false,
  apiKey: UNSET,
  bedrockAccessKeyId: UNSET,
  bedrockSecretAccessKey: UNSET,
  ...over,
});

const openAiStored = (): PlatformSettings['ai'] =>
  bedrockAi({
    provider: { value: 'openai', source: 'db' },
    defaultModel: { value: 'gpt-5-mini', source: 'db' },
    strongModel: { value: 'gpt-5', source: 'db' },
    visionModel: { value: 'gpt-4o-mini', source: 'db' },
    bedrockRegion: { value: null, source: 'default' },
    bedrockUseInstanceProfile: { value: null, source: 'default' },
    bedrockInferenceProfileArn: { value: null, source: 'default' },
  });

const renderCard = (ai: PlatformSettings['ai']) =>
  render(<ManagedAiDefaultsCard ai={ai} secrets={SECRETS} />);
const openEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(edit|configure)/i }));
const summaryValue = (label: string): string => {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.nextElementSibling?.textContent ?? '';
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  saveSucceeds = true;
  instanceProfileAllowed = true;
});

/**
 * Owner, 2026-09-30: "cant click on test connection as its disabled". The probe tests what is
 * STORED, so the button was greyed out for the whole edit — the one moment an admin wants it.
 */
describe('Managed AI defaults — Save and test', () => {
  it('saves the draft, THEN tests it', async () => {
    testManagedAi.mockResolvedValue({
      ok: true,
      provider: 'bedrock',
      model: PROFILE,
      latencyMs: 9,
    });
    renderCard(bedrockAi());
    openEditor();

    const button = screen.getByRole('button', { name: /save and test/i });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(saveMutation.mutate).toHaveBeenCalledTimes(1);
    expect(saveMutation.mutate.mock.calls[0][0]).toMatchObject({
      provider: 'bedrock',
      bedrockRegion: 'eu-west-1',
      bedrockUseInstanceProfile: true,
    });
    await waitFor(() => expect(screen.getByText(/bedrock answered with/i)).toBeInTheDocument());
    expect(testManagedAi).toHaveBeenCalledTimes(1);
    expect(saveMutation.mutate.mock.invocationCallOrder[0]).toBeLessThan(
      testManagedAi.mock.invocationCallOrder[0]
    );
  });

  it('⛔ does not test when the save failed — the probe would answer for the OLD config', () => {
    saveSucceeds = false;
    renderCard(bedrockAi());
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /save and test/i }));

    expect(saveMutation.mutate).toHaveBeenCalledTimes(1);
    expect(testManagedAi).not.toHaveBeenCalled();
  });

  it('⛔ a save clears the previous result — it described the config before the save', async () => {
    testManagedAi.mockResolvedValue({
      ok: true,
      provider: 'bedrock',
      model: PROFILE,
      latencyMs: 9,
    });
    renderCard(bedrockAi());
    fireEvent.click(screen.getByRole('button', { name: /^test connection/i }));
    await waitFor(() => expect(screen.getByText(/bedrock answered with/i)).toBeInTheDocument());

    openEditor();
    fireEvent.change(screen.getByDisplayValue('eu-west-1 (Ireland)'), {
      target: { value: 'us-east-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));

    expect(screen.queryByText(/bedrock answered with/i)).not.toBeInTheDocument();
  });

  it('⛔ a probe still running when the config is saved does not report on the new config', async () => {
    let finishOldProbe: (value: unknown) => void = () => {};
    testManagedAi.mockImplementationOnce(
      () => new Promise((resolve) => (finishOldProbe = resolve))
    );
    renderCard(bedrockAi());
    fireEvent.click(screen.getByRole('button', { name: /^test connection/i }));
    openEditor();
    fireEvent.change(screen.getByDisplayValue('eu-west-1 (Ireland)'), {
      target: { value: 'us-east-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));
    expect(saveMutation.mutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishOldProbe({ ok: true, provider: 'bedrock', model: 'OLD-CONFIG', latencyMs: 1 });
      await Promise.resolve();
    });
    expect(screen.queryByText(/answered with OLD-CONFIG/)).not.toBeInTheDocument();
  });

  it('⛔ … nor when the provider is switched while it runs, and a failure is dropped too', async () => {
    let failOldProbe: (reason: unknown) => void = () => {};
    testManagedAi.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failOldProbe = reject))
    );
    renderCard(bedrockAi());
    fireEvent.click(screen.getByRole('button', { name: /^test connection/i }));
    openEditor();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'openai' } });

    await act(async () => {
      failOldProbe(new Error('OLD-CONFIG timed out'));
      await Promise.resolve();
    });
    expect(screen.queryByText(/OLD-CONFIG timed out/)).not.toBeInTheDocument();
  });

  it('CONTROL: a probe nobody overtook still reports', async () => {
    let finishProbe: (value: unknown) => void = () => {};
    testManagedAi.mockImplementationOnce(() => new Promise((resolve) => (finishProbe = resolve)));
    renderCard(bedrockAi());
    fireEvent.click(screen.getByRole('button', { name: /^test connection/i }));
    await act(async () => {
      finishProbe({ ok: true, provider: 'bedrock', model: 'CURRENT', latencyMs: 1 });
      await Promise.resolve();
    });
    expect(screen.getByText(/answered with CURRENT/)).toBeInTheDocument();
  });

  it('the plain Save does not test', () => {
    renderCard(bedrockAi());
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /save ai defaults/i }));

    expect(saveMutation.mutate).toHaveBeenCalledTimes(1);
    expect(testManagedAi).not.toHaveBeenCalled();
  });

  it('is blocked, like Save, by a credential nobody saved', () => {
    renderCard(openAiStored());
    openEditor();
    fireEvent.change(screen.getByPlaceholderText(/enter a value/i), {
      target: { value: 'sk-typed-not-saved' },
    });

    const button = screen.getByRole('button', { name: /save and test/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(saveMutation.mutate).not.toHaveBeenCalled();
  });

  it('outside the editor stays a plain Test connection', () => {
    renderCard(bedrockAi());
    expect(screen.getByRole('button', { name: /^test connection/i })).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: /save and test/i })).not.toBeInTheDocument();
  });
});

describe('Managed AI defaults — a result belongs to the credential it probed', () => {
  const answered = { ok: true, provider: 'bedrock', model: PROFILE, latencyMs: 9 };

  it('⛔ replacing a stored Bedrock key hides the older answer', async () => {
    testManagedAi.mockResolvedValue(answered);
    const { rerender } = renderCard(bedrockAi());
    fireEvent.click(screen.getByRole('button', { name: /^test connection/i }));
    await waitFor(() => expect(screen.getByText(/bedrock answered with/i)).toBeInTheDocument());

    rerender(
      <ManagedAiDefaultsCard
        ai={bedrockAi({ bedrockAccessKeyId: STORED('NEW1') })}
        secrets={SECRETS}
      />
    );
    expect(screen.queryByText(/bedrock answered with/i)).not.toBeInTheDocument();
  });

  it('⛔ replacing the stored OpenAI key hides the older answer', async () => {
    testManagedAi.mockResolvedValue({
      ok: true,
      provider: 'openai',
      model: 'gpt-5-mini',
      latencyMs: 9,
    });
    const { rerender } = renderCard(openAiStored());
    fireEvent.click(screen.getByRole('button', { name: /^test connection/i }));
    await waitFor(() => expect(screen.getByText(/openai answered with/i)).toBeInTheDocument());

    rerender(
      <ManagedAiDefaultsCard
        ai={openAiStored()}
        secrets={{ ...SECRETS, 'ai.openai_api_key': STORED('NEW1') }}
      />
    );
    expect(screen.queryByText(/openai answered with/i)).not.toBeInTheDocument();
  });

  it('⛔ Save and test that SWITCHES provider keeps its answer once the settings refetch', async () => {
    testManagedAi.mockResolvedValue(answered);
    const { rerender } = renderCard(openAiStored());
    openEditor();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'bedrock' } });
    fireEvent.click(screen.getByRole('button', { name: /save and test/i }));
    await waitFor(() => expect(screen.getByText(/bedrock answered with/i)).toBeInTheDocument());

    // The save invalidated the settings query; the refetch now says Bedrock is stored.
    rerender(<ManagedAiDefaultsCard ai={bedrockAi()} secrets={SECRETS} />);
    expect(screen.getByText(/bedrock answered with/i)).toBeInTheDocument();
  });

  it("CONTROL: another provider's key changing does not hide a Bedrock answer", async () => {
    testManagedAi.mockResolvedValue(answered);
    const { rerender } = renderCard(bedrockAi());
    fireEvent.click(screen.getByRole('button', { name: /^test connection/i }));
    await waitFor(() => expect(screen.getByText(/bedrock answered with/i)).toBeInTheDocument());

    rerender(
      <ManagedAiDefaultsCard
        ai={bedrockAi()}
        secrets={{ ...SECRETS, 'ai.openai_api_key': STORED('NEW1') }}
      />
    );
    expect(screen.getByText(/bedrock answered with/i)).toBeInTheDocument();
  });
});

describe('Managed AI defaults — what the stored Bedrock view says', () => {
  it('shows region and inference profile, and that the profile serves every tier', () => {
    renderCard(bedrockAi());
    expect(summaryValue('Region')).toContain('eu-west-1');
    expect(summaryValue('Inference profile')).toContain(PROFILE);
    expect(summaryValue('Inference profile')).toMatch(/every tier/i);
  });

  it('has no "API key" row — Bedrock has no API key, so "none stored" read as a gap', () => {
    renderCard(bedrockAi());
    expect(screen.queryByText('API key', { selector: 'dt' })).not.toBeInTheDocument();
  });

  it('keeps the API key row for a key-based provider', () => {
    renderCard(openAiStored());
    expect(summaryValue('API key')).toMatch(/none stored/i);
    expect(screen.queryByText('Region', { selector: 'dt' })).not.toBeInTheDocument();
  });

  it('names the instance profile when the switch is on', () => {
    renderCard(bedrockAi());
    expect(summaryValue('AWS credentials')).toMatch(/server's aws identity/i);
  });

  it('⛔ instance profile wins over stored keys — the backend checks it FIRST', () => {
    renderCard(
      bedrockAi({ bedrockAccessKeyId: STORED('ABCD'), bedrockSecretAccessKey: STORED('wxyz') })
    );
    expect(summaryValue('AWS credentials')).toMatch(/instance profile/i);
  });

  it('says the switch is ignored where the deployment does not allow it', () => {
    instanceProfileAllowed = false;
    renderCard(bedrockAi());
    expect(summaryValue('AWS credentials')).toMatch(/ignored on this deployment/i);
  });

  it('names the stored access key when keys are the credential', () => {
    renderCard(
      bedrockAi({
        bedrockUseInstanceProfile: { value: false, source: 'db' },
        bedrockAccessKeyId: STORED('ABCD'),
        bedrockSecretAccessKey: STORED('wxyz'),
      })
    );
    expect(summaryValue('AWS credentials')).toMatch(/IAM access key ····ABCD/);
  });

  it('a key id without its secret is not a credential', () => {
    renderCard(
      bedrockAi({
        bedrockUseInstanceProfile: { value: false, source: 'db' },
        bedrockAccessKeyId: STORED('ABCD'),
      })
    );
    expect(summaryValue('AWS credentials')).toMatch(/default credential chain/i);
  });

  it('names the role only with an external ID — the backend skips a role without one', () => {
    const noSwitch = { bedrockUseInstanceProfile: { value: false, source: 'db' as const } };
    renderCard(
      bedrockAi({
        ...noSwitch,
        bedrockRoleArn: { value: ROLE, source: 'db' },
        bedrockExternalId: { value: 'ext-1', source: 'db' },
      })
    );
    expect(summaryValue('AWS credentials')).toBe(`AssumeRole ${ROLE}`);
    cleanup();

    renderCard(bedrockAi({ ...noSwitch, bedrockRoleArn: { value: ROLE, source: 'db' } }));
    expect(summaryValue('AWS credentials')).toMatch(/not used without an external ID/i);
  });
});

describe('Managed AI defaults — Bedrock form', () => {
  it('offers Claude Haiku 4.5 for the Vision tier in a dropdown, not a free-text box', () => {
    renderCard(bedrockAi());
    openEditor();
    const visionLabel = screen.getByText(/vision tier — model/i);
    const field = visionLabel.closest('div')?.parentElement as HTMLElement;
    const picker = within(field).getByRole('combobox');
    const ids = Array.from((picker as HTMLSelectElement).options).map((option) => option.value);
    expect(ids).toContain('anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(ids).toContain(PROFILE);
  });

  it("does not show the stored provider's model as the placeholder under a switch", () => {
    // Custom has no catalog, so every tier is free text — the case the screenshot showed for
    // Bedrock's vision tier ("gpt-4o-mini" under AWS Bedrock).
    renderCard(openAiStored());
    openEditor();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'custom' } });
    expect(screen.queryByPlaceholderText('gpt-4o-mini')).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('model id').length).toBe(3);
  });

  it("states the backend's credential order and that a role needs its external ID", () => {
    renderCard(bedrockAi());
    openEditor();
    expect(screen.getByText(/external id \(required with a role\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /server's AWS identity when the switch above is on, then the stored access keys/i
      )
    ).toBeInTheDocument();
  });
});
