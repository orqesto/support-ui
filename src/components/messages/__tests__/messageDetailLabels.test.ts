/**
 * Mutation batch (message detail v4), chunk 6: the label helpers every message-detail surface
 * shares had no test of their own — each could be emptied with the suite green.
 */
import { describe, it, expect } from 'vitest';
import {
  HEADER_PRIORITY_OPTIONS,
  channelInSentence,
  channelName,
  createTicketLabel,
  priorityLabel,
  sentenceCase,
  statusLabel,
} from '../messageDetailConstants';

describe('message-detail labels', () => {
  it('sentenceCase: first letter up, the rest down; an empty label stays empty', () => {
    expect(sentenceCase('In Progress')).toBe('In progress');
    expect(sentenceCase('HIGH')).toBe('High');
    expect(sentenceCase('')).toBe('');
  });

  it('statusLabel: every underscore becomes a space', () => {
    expect(statusLabel('in_progress')).toBe('In progress');
    expect(statusLabel('awaiting_customer_reply')).toBe('Awaiting customer reply');
  });

  it('priorityLabel: "high" → "High"', () => {
    expect(priorityLabel('high')).toBe('High');
    expect(priorityLabel('CRITICAL')).toBe('Critical');
  });

  it('channelName: product names keep their capitals, unknown keys read as words, nothing reads as nothing', () => {
    expect(channelName('whatsapp')).toBe('WhatsApp');
    expect(channelName('email')).toBe('Email');
    expect(channelName('carrier_pigeon')).toBe('Carrier pigeon');
    expect(channelName(null)).toBe('');
    expect(channelName(undefined)).toBe('');
  });

  it('channelInSentence: lower case unless a product name', () => {
    expect(channelInSentence('email')).toBe('email');
    expect(channelInSentence('whatsapp')).toBe('WhatsApp');
    expect(channelInSentence('telegram')).toBe('Telegram');
    expect(channelInSentence(null)).toBe('');
  });

  it('createTicketLabel: a lead thread makes a lead ticket', () => {
    expect(createTicketLabel(true)).toBe('Create lead ticket');
    expect(createTicketLabel(false)).toBe('Create ticket');
    expect(createTicketLabel(undefined)).toBe('Create ticket');
  });

  it('HEADER_PRIORITY_OPTIONS: each option labelled in sentence case, nothing lost', () => {
    expect(HEADER_PRIORITY_OPTIONS.length).toBeGreaterThanOrEqual(3);
    for (const option of HEADER_PRIORITY_OPTIONS) {
      expect(option.label).toBe(priorityLabel(option.value));
      expect(option.menuLabel).toBe(option.label);
      expect(option.label).toMatch(/^[A-Z][a-z]+$/);
      expect(option.chipClassName).toBeTruthy();
    }
  });
});
