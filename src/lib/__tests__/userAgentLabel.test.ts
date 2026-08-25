/**
 * Device labels a person is asked to make a security decision from.
 *
 * The failure that matters is not "unrecognised" — it is a CONFIDENT WRONG label. Every Chromium
 * browser reports "Chrome" and Chrome itself reports "Safari", so naive matching quietly turns an
 * Edge session on Windows into "Safari on Mac". Someone scanning for a device they do not
 * recognise would then either revoke their own laptop or leave an intruder's session alone.
 */
import { describe, expect, it } from 'vitest';
import { describeUserAgent } from '@/lib/userAgentLabel';

describe('describeUserAgent', () => {
  it('does not let Chrome masquerade as Safari', () => {
    // Chrome's UA contains the literal "Safari/537.36". Ordering is the whole fix.
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      )
    ).toBe('Chrome on Mac');
  });

  it('does not let Edge masquerade as Chrome', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0'
      )
    ).toBe('Edge on Windows');
  });

  it('reads real Safari as Safari', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe('Safari on iPhone');
  });

  it('prefers the specific platform over the generic one it also matches', () => {
    // Android UAs also say "Linux". Reporting "Chrome on Linux" for a phone is the wrong answer.
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
      )
    ).toBe('Chrome on Android');
  });

  it('says "unknown device" rather than inventing one when there is nothing to read', () => {
    expect(describeUserAgent(null)).toBe('Unknown device');
    expect(describeUserAgent('')).toBe('Unknown device');
    expect(describeUserAgent('   ')).toBe('Unknown device');
  });

  it('shows an unrecognised agent instead of pretending to identify it', () => {
    expect(describeUserAgent('curl/8.4.0')).toBe('curl/8.4.0');
  });

  it('truncates a long unrecognised agent so one row cannot wreck the list', () => {
    const long = 'x'.repeat(200);
    const label = describeUserAgent(long);
    expect(label.length).toBeLessThanOrEqual(41);
    expect(label.endsWith('…')).toBe(true);
  });
});
