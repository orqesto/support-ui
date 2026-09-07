/**
 * The provisioning card used to report two things wrongly.
 *
 * It printed "<n> mapped" for a number that counts groups RECEIVED from the IdP, so on
 * taco it read "10 mapped" while exactly one group was wired to a role — the card said
 * the wiring was done. And nothing on it distinguished a quiet connector from a dead one,
 * because the only freshness signal shown (`groups.lastSyncedAt`) moves solely when a
 * group changes; taco's read 3 September while the IdP had authenticated on the 6th.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { ScimTelemetryCard } from '../ScimTelemetryCard';
import type { AllianceScimTelemetry } from '@/services/alliance-scim.service';

const telemetry = (
  connector?: AllianceScimTelemetry['connector']
): AllianceScimTelemetry => ({
  config: { enabled: true, allowScimAccountLinking: true },
  tokens: { total: 1, active: 1, revoked: 0, lastUsedAt: '2026-09-06T12:34:02.000Z' },
  groups: { total: 10, memberships: 19, lastSyncedAt: '2026-09-03T07:44:15.000Z' },
  notes: [],
  connector,
});

afterEach(cleanup);

describe('ScimTelemetryCard — group count label', () => {
  it('does not call the received-group count "mapped"', () => {
    render(<ScimTelemetryCard telemetry={telemetry()} />);
    expect(screen.getByText(/synced from IdP/i)).toBeInTheDocument();
    expect(screen.queryByText(/mapped/i)).not.toBeInTheDocument();
  });
});

describe('ScimTelemetryCard — connector liveness', () => {
  it('warns when the connector has gone silent, and says how long', () => {
    render(
      <ScimTelemetryCard
        telemetry={telemetry({ state: 'stale', hoursSinceLastUse: 100, staleAfterHours: 72 })}
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/100h ago/)).toBeInTheDocument();
    expect(screen.getByText(/after 72h/)).toBeInTheDocument();
  });

  it('warns when SCIM is on but no token can authenticate', () => {
    render(
      <ScimTelemetryCard
        telemetry={telemetry({ state: 'no_token', hoursSinceLastUse: null, staleAfterHours: 72 })}
      />
    );
    // The label appears twice by design — once as the badge, once opening the alert —
    // so assert on the actionable sentence, which is unique to the warning.
    expect(screen.getAllByText(/No active token/).length).toBeGreaterThan(0);
    expect(screen.getByRole('alert')).toHaveTextContent(/Mint one/);
  });

  it('CONTROL: a healthy connector shows a badge and NO warning', () => {
    // The failure mode a warning banner invites is crying wolf on every healthy alliance.
    render(
      <ScimTelemetryCard
        telemetry={telemetry({ state: 'active', hoursSinceLastUse: 20, staleAfterHours: 72 })}
      />
    );
    expect(screen.getByText(/Connector active/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('CONTROL: a deliberately disabled connector is not warned about', () => {
    render(
      <ScimTelemetryCard
        telemetry={telemetry({ state: 'disabled', hoursSinceLastUse: null, staleAfterHours: 72 })}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('CONTROL: renders against a BACKEND that does not send the field at all', () => {
    // FE ships on merge and the BE only on a tag, so the FE runs ahead of it by design.
    // Reading `connector.state` off an absent object is how that becomes a blank page.
    render(<ScimTelemetryCard telemetry={telemetry(undefined)} />);
    expect(screen.getByText(/synced from IdP/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
