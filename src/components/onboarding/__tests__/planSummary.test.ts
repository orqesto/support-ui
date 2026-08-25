import { describe, it, expect } from 'vitest';
import {
  formatFeatureAdditions,
  formatStorage,
  planFeatureAdditions,
  planLimitLines,
} from '../planSummary';
import type { SubscriptionPlan } from '@/services/subscription.service';

/**
 * The card lines are DERIVED from the plan row so they cannot drift from what
 * billing actually enforces. These tests use the real production plan values,
 * so a change to the shape of that row shows up here rather than as wrong
 * numbers on the last step of onboarding.
 */

const plan = (over: Partial<SubscriptionPlan>): SubscriptionPlan => ({
  id: 1,
  name: 'starter',
  displayName: 'Starter',
  planType: 'base',
  price: 15000,
  currency: 'EUR',
  billingInterval: 'month',
  ...over,
});

const STARTER = plan({
  name: 'starter',
  displayName: 'Starter',
  price: 15000,
  limits: { maxUsers: 5, maxMessagesPerMonth: 4000, maxIntegrations: 3, maxStorageMb: 10240 },
  features: { aiAutoReply: false, sso: false, scim: false, auditLogs: false },
});

const PRO = plan({
  name: 'pro',
  displayName: 'Pro',
  price: 50000,
  limits: { maxUsers: 20, maxMessagesPerMonth: 16000, maxIntegrations: 10, maxStorageMb: 102400 },
  features: {
    aiAutoReply: true,
    advancedAnalytics: true,
    leadQualification: true,
    jiraSync: true,
    sso: false,
    scim: false,
    auditLogs: false,
  },
});

const ENTERPRISE = plan({
  name: 'enterprise-cloud',
  displayName: 'Enterprise Cloud',
  price: 100000,
  limits: {
    maxUsers: 50,
    maxMessagesPerMonth: 40000,
    maxIntegrations: 25,
    maxStorageMb: 1048576,
  },
  features: {
    aiAutoReply: true,
    advancedAnalytics: true,
    leadQualification: true,
    jiraSync: true,
    sso: true,
    scim: true,
    auditLogs: true,
    customWorkflows: true,
    dedicatedOnboarding: true,
  },
});

describe('planLimitLines', () => {
  it('reads the caps a buyer compares tiers on', () => {
    expect(planLimitLines(STARTER)).toEqual([
      '5 agents',
      '4,000 messages/mo',
      '3 channels',
      '10 GB',
    ]);
    expect(planLimitLines(ENTERPRISE)).toEqual([
      '50 agents',
      '40,000 messages/mo',
      '25 channels',
      '1 TB',
    ]);
  });

  it('returns nothing rather than throwing when the backend sends no limits', () => {
    // An older deployed backend is the realistic case; a card that reads
    // through a missing object would white-screen the final onboarding step.
    expect(planLimitLines(plan({ limits: undefined }))).toEqual([]);
    expect(planLimitLines(plan({ limits: null }))).toEqual([]);
  });

  it('never prints the unlimited sentinel at a customer', () => {
    expect(
      planLimitLines(plan({ limits: { maxUsers: 999999, maxStorageMb: 999999 } }))
    ).toEqual(['Unlimited agents', 'Unlimited storage']);
  });
});

describe('formatStorage', () => {
  it('scales megabytes to something readable', () => {
    expect(formatStorage(512)).toBe('512 MB');
    expect(formatStorage(10240)).toBe('10 GB');
    expect(formatStorage(102400)).toBe('100 GB');
    expect(formatStorage(1048576)).toBe('1 TB');
  });
});

describe('planFeatureAdditions', () => {
  it('is a delta over the tier below, not a full feature list', () => {
    // The question at this point in the wizard is what the extra money buys.
    expect(planFeatureAdditions(PRO, STARTER)).toEqual([
      'AI auto-reply',
      'lead qualification',
      'advanced analytics',
      'Jira sync',
    ]);
    expect(planFeatureAdditions(ENTERPRISE, PRO)).toEqual([
      'SSO',
      'SCIM provisioning',
      'audit logs',
      'custom workflows',
      'dedicated onboarding',
    ]);
  });

  it('gives the cheapest tier no line — there is nothing below it', () => {
    expect(planFeatureAdditions(STARTER, undefined)).toEqual([]);
  });

  it('survives a plan row with no features', () => {
    expect(planFeatureAdditions(plan({ features: undefined }), STARTER)).toEqual([]);
  });
});

describe('formatFeatureAdditions', () => {
  it('truncates so one tall card cannot unbalance the grid', () => {
    expect(formatFeatureAdditions(planFeatureAdditions(ENTERPRISE, PRO))).toBe(
      'Adds SSO, SCIM provisioning, audit logs +2 more'
    );
  });

  it('omits the counter when everything fits', () => {
    expect(formatFeatureAdditions(['SSO'])).toBe('Adds SSO');
  });

  it('is null when a tier adds nothing nameable', () => {
    expect(formatFeatureAdditions([])).toBeNull();
  });
});
