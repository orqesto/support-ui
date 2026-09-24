import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * Lead qualification writes the replies sent to leads, so AI drafts off stops it as a whole on
 * the backend. The tab keeps the settings and must say they are not running meanwhile.
 */

const aiDrafts = vi.hoisted(() => ({ off: false }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true, available: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('../LeadQualificationSettings', () => ({
  LeadQualificationSettings: () => <div>lead settings</div>,
}));

import { LeadQualificationSection } from '../LeadQualificationSection';

afterEach(() => {
  cleanup();
  aiDrafts.off = false;
});

describe('LeadQualificationSection — AI drafts off', () => {
  it('says lead qualification is not running, above the kept settings', () => {
    aiDrafts.off = true;
    render(<LeadQualificationSection />);
    expect(screen.getByText(/lead qualification is not running/i)).toBeTruthy();
    expect(screen.getByText('lead settings')).toBeTruthy();
  });

  it('says nothing of the kind with drafts on (control)', () => {
    render(<LeadQualificationSection />);
    expect(screen.queryByText(/lead qualification is not running/i)).toBeNull();
    expect(screen.getByText('lead settings')).toBeTruthy();
  });
});
