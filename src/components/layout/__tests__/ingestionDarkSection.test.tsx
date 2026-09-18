/**
 * What the dark-mailbox row actually SAYS.
 *
 * ⛔ This file exists because an audit caught the first draft saying "No mail collected for 68
 * minutes". `minutesSince` measures time since the last POLL, not since mail last arrived — a
 * quiet mailbox checked every five minutes is perfectly healthy — so that sentence told an
 * operator their customers had gone silent when the truth was that we had stopped looking.
 * The hook tests could not catch it: they assert the data, and the defect was in the words.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IngestionDarkSection } from '../IngestionDarkSection';
import type { IngestionDarkAlert } from '@/hooks/useIngestionDarkAlerts';

const SectionLabel = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

const alert = (over: Partial<IngestionDarkAlert> = {}): IngestionDarkAlert => ({
  id: 1,
  messageSourceId: 34,
  mailbox: 'Gmail-info@coresarms.info',
  minutesSince: 68,
  neverPolled: false,
  locked: false,
  severity: 'critical',
  ...over,
});

const renderSection = (alerts: IngestionDarkAlert[]) =>
  render(
    <IngestionDarkSection
      alerts={alerts}
      dismiss={vi.fn()}
      showLabel
      SectionLabel={SectionLabel}
    />
  );

describe('IngestionDarkSection', () => {
  it('says we stopped CHECKING, never that mail stopped arriving', () => {
    renderSection([alert({ minutesSince: 68 })]);

    expect(screen.getByText(/Not checked for/i)).toBeInTheDocument();
    // ⛔ The regression this file was written for.
    expect(screen.queryByText(/no mail collected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no mail received/i)).not.toBeInTheDocument();
  });

  it('gives a never-checked mailbox its own sentence, not a number', () => {
    renderSection([alert({ minutesSince: null, neverPolled: true })]);

    expect(screen.getByText(/never been checked/i)).toBeInTheDocument();
    // "0 minutes" would describe the worst state in the mildest words.
    expect(screen.queryByText(/0 minutes/i)).not.toBeInTheDocument();
  });

  it('tells the operator the restart is already happening', () => {
    renderSection([alert()]);

    expect(screen.getByText(/restarted automatically/i)).toBeInTheDocument();
  });

  it('says a person is needed when the source is LOCKED', () => {
    // Restarting polling cannot clear a lock a previous run still holds, so the reassuring
    // sentence above would be false here — the watchdog would restart it every 15 minutes for
    // ever while the mailbox stayed dark.
    renderSection([alert({ locked: true })]);

    expect(screen.getByText(/needs a person/i)).toBeInTheDocument();
    expect(screen.queryByText(/restarted automatically/i)).not.toBeInTheDocument();
  });

  it('renders nothing at all when there is nothing wrong', () => {
    const { container } = renderSection([]);

    // A section that renders an empty shell still costs the operator a glance.
    expect(container).toBeEmptyDOMElement();
  });

  it('names the mailbox, so an operator knows WHICH one', () => {
    renderSection([alert({ mailbox: 'Gmail-orders@deuspower.info' })]);

    expect(screen.getByText('Gmail-orders@deuspower.info')).toBeInTheDocument();
  });
});
