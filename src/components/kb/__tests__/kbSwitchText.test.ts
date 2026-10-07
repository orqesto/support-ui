/**
 * Owner, 2026-10-07: the KB consolidation "off" text pointed at a global switch that never
 * reaches a hosted workspace on its own AI key, and called a configured trial "switched off".
 * One function maps the backend's `switches` to the words; each branch of the contract is here.
 */
import { describe, expect, it } from 'vitest';
import { consolidationSwitchText, qualitySwitchText } from '../kbSwitchText';
import {
  normalizeRunState,
  normalizeSwitches,
  type KbConsolidationSwitches,
} from '@/services/kbConsolidation.service';

const sw = (over: Partial<KbConsolidationSwitches> = {}): KbConsolidationSwitches => ({
  ownKey: false,
  selfHosted: false,
  globalApplies: true,
  enabled: { on: true, from: 'global' },
  dryRun: { on: false, from: 'default' },
  quality: { on: true, from: 'global' },
  ...over,
});
const ownKeyHosted = (over: Partial<KbConsolidationSwitches> = {}) =>
  sw({ ownKey: true, selfHosted: false, globalApplies: false, ...over });

describe('consolidationSwitchText', () => {
  it('own key, hosted, off ⇒ the global switch does not reach it; turn it on at this workspace by name', () => {
    expect(
      consolidationSwitchText(ownKeyHosted({ enabled: { on: false, from: 'default' } }), 'Acme')
    ).toBe(
      'This workspace uses its own AI key, so the global switch does not reach it. Ask the platform admin to turn kb.consolidation_enabled on for this workspace (Console → Feature flags → scope Acme).'
    );
  });

  it('own key, name not known ⇒ says "this workspace", never a blank', () => {
    expect(
      consolidationSwitchText(ownKeyHosted({ enabled: { on: false, from: 'default' } }))
    ).toMatch(/Console → Feature flags → this workspace's scope\)\.$/);
  });

  it('off where the global row applies ⇒ names the flag and the console', () => {
    expect(consolidationSwitchText(sw({ enabled: { on: false, from: 'global' } }), 'Acme')).toBe(
      'Consolidation is switched off (kb.consolidation_enabled). Ask the platform admin to turn it on (Console → Feature flags).'
    );
  });

  it("off by this workspace's own row ⇒ points at the workspace scope (a global ON is out-voted)", () => {
    expect(consolidationSwitchText(sw({ enabled: { on: false, from: 'workspace' } }), 'Acme')).toBe(
      'Consolidation is switched off (kb.consolidation_enabled). Ask the platform admin to turn it on (Console → Feature flags → scope Acme).'
    );
  });

  it('self-hosted own-key workspace ⇒ NOT the own-key text (the global row reaches it)', () => {
    const text = consolidationSwitchText(
      sw({
        ownKey: true,
        selfHosted: true,
        globalApplies: true,
        enabled: { on: false, from: 'default' },
      })
    );
    expect(text).toMatch(/^Consolidation is switched off/);
  });

  it('on + dry run from the global row ⇒ trial, scope global', () => {
    expect(consolidationSwitchText(sw({ dryRun: { on: true, from: 'global' } }), 'Acme')).toBe(
      'Trial run: entries are labelled only — no cases are proposed, and the nightly quality review does not run. For real cases, ask the platform admin to turn kb.consolidation_dry_run off (Console → Feature flags → scope global).'
    );
  });

  it('on + dry run from the workspace row ⇒ scope is the workspace name', () => {
    expect(
      consolidationSwitchText(sw({ dryRun: { on: true, from: 'workspace' } }), 'Acme')
    ).toContain('scope Acme)');
  });

  it('on + dry run by the code default or an unknown layer ⇒ no scope is claimed', () => {
    for (const from of ['default', null] as const)
      expect(consolidationSwitchText(sw({ dryRun: { on: true, from } }), 'Acme')).toBe(
        'Trial run: entries are labelled only — no cases are proposed, and the nightly quality review does not run. For real cases, ask the platform admin to turn kb.consolidation_dry_run off.'
      );
  });

  it('off wins over a trial (the contract order)', () => {
    expect(
      consolidationSwitchText(
        sw({ enabled: { on: false, from: 'global' }, dryRun: { on: true, from: 'global' } })
      )
    ).toMatch(/^Consolidation is switched off/);
  });

  it('a flag the backend could not read is not "switched off — turn it on"', () => {
    expect(
      consolidationSwitchText(
        ownKeyHosted({ enabled: { on: false, from: 'default', unreadable: true } })
      )
    ).toBe(
      'kb.consolidation_enabled could not be read, so consolidation does not run until it can.'
    );
    expect(
      consolidationSwitchText(sw({ dryRun: { on: false, from: 'default', unreadable: true } }))
    ).toBe(
      'kb.consolidation_dry_run could not be read, so consolidation does not run until it can.'
    );
    expect(
      qualitySwitchText(sw({ dryRun: { on: false, from: 'default', unreadable: true } }))
    ).toBe(
      'The nightly quality review runs only with consolidation. kb.consolidation_dry_run could not be read, so consolidation does not run until it can.'
    );
    expect(
      qualitySwitchText(sw({ quality: { on: false, from: 'default', unreadable: true } }))
    ).toBe(
      'kb.quality_review_enabled could not be read, so the nightly quality review does not run until it can.'
    );
  });

  it('CONTROL — on, no trial ⇒ nothing to say; dry run unknown ⇒ nothing claimed', () => {
    expect(consolidationSwitchText(sw())).toBeNull();
    expect(consolidationSwitchText(sw({ dryRun: null }))).toBeNull();
  });

  it('old backend (no switches) ⇒ null, so the caller keeps its own text', () => {
    expect(consolidationSwitchText(undefined)).toBeNull();
    expect(consolidationSwitchText(null)).toBeNull();
  });
});

describe('qualitySwitchText', () => {
  it('consolidation off ⇒ the review runs only with it, and names THAT switch', () => {
    const text = qualitySwitchText(sw({ enabled: { on: false, from: 'global' } }));
    expect(text).toBe(
      'The nightly quality review runs only with consolidation. Consolidation is switched off (kb.consolidation_enabled). Ask the platform admin to turn it on (Console → Feature flags).'
    );
  });

  it('quality off, own key on hosted ⇒ names kb.quality_review_enabled at this workspace', () => {
    expect(
      qualitySwitchText(ownKeyHosted({ quality: { on: false, from: 'default' } }), 'Acme')
    ).toBe(
      'This workspace uses its own AI key, so the global switch does not reach it. Ask the platform admin to turn kb.quality_review_enabled on for this workspace (Console → Feature flags → scope Acme).'
    );
  });

  it('quality off where the global row applies ⇒ names the flag', () => {
    expect(qualitySwitchText(sw({ quality: { on: false, from: 'global' } }))).toBe(
      'The nightly quality review is switched off (kb.quality_review_enabled). Ask the platform admin to turn it on (Console → Feature flags).'
    );
  });

  it('CONTROL — all on, or quality not sent ⇒ null', () => {
    expect(qualitySwitchText(sw())).toBeNull();
    expect(qualitySwitchText(sw({ quality: null }))).toBeNull();
    expect(qualitySwitchText(undefined)).toBeNull();
  });
});

describe('normalizeSwitches (version skew)', () => {
  const full = {
    ownKey: true,
    selfHosted: false,
    globalApplies: false,
    enabled: { on: false, from: 'default' },
    dryRun: { on: true, from: 'global' },
    quality: { on: false, from: 'workspace' },
  };

  it('reads the contract shape', () => {
    expect(normalizeSwitches(full)).toEqual(full);
  });

  it('an old backend (absent) or junk ⇒ null', () => {
    for (const raw of [undefined, null, 'on', 3, {}, { enabled: { on: 'yes' } }])
      expect(normalizeSwitches(raw)).toBeNull();
  });

  it('globalApplies absent ⇒ the contract rule from ownKey/selfHosted; unknowable ⇒ null', () => {
    const { globalApplies: _omit, ...rest } = full;
    expect(normalizeSwitches(rest)?.globalApplies).toBe(false);
    expect(normalizeSwitches({ ...rest, selfHosted: true })?.globalApplies).toBe(true);
    expect(normalizeSwitches({ enabled: { on: false, from: 'global' } })).toBeNull();
  });

  it('`unreadable` is kept only when exactly true', () => {
    expect(
      normalizeSwitches({ ...full, enabled: { on: false, from: 'default', unreadable: true } })
        ?.enabled
    ).toEqual({
      on: false,
      from: 'default',
      unreadable: true,
    });
    expect(
      normalizeSwitches({ ...full, enabled: { on: false, from: 'default', unreadable: 'yes' } })
        ?.enabled
    ).toEqual({
      on: false,
      from: 'default',
    });
  });

  it('an unknown layer reads as no layer; an unreadable dryRun/quality as not sent', () => {
    const out = normalizeSwitches({
      ...full,
      enabled: { on: false, from: 'tenant' },
      dryRun: 1,
      quality: {},
    });
    expect(out?.enabled).toEqual({ on: false, from: null });
    expect(out?.dryRun).toBeNull();
    expect(out?.quality).toBeNull();
  });

  it('a run state from an old backend has no `switches` key at all', () => {
    expect(normalizeRunState({ runningSince: null, last: null, canRun: true })).toEqual({
      runningSince: null,
      last: null,
      canRun: true,
    });
    expect(normalizeRunState({ canRun: true, switches: full }).switches).toEqual(full);
  });
});
