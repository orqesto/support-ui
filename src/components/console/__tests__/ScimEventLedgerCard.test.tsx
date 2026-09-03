import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScimEventLedgerCard } from '../ScimEventLedgerCard';
import type {
  AllianceScimEvent,
  AllianceScimEventPage,
  AllianceScimTelemetry,
} from '@/services/alliance-scim.service';

/**
 * Verifies the ledger card's two safety properties the panel was built for:
 *   1. 404-tolerance — an `available:false` page (pre-ledger backend) renders NOTHING.
 *   2. the last-admin lockout banner appears IFF telemetry says `hasActiveAdmin:false`.
 * Each "must show" is paired with a control that must NOT.
 */

type MockEventsQuery = {
  data?: { pages: AllianceScimEventPage[] };
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
};

let eventsReturn: MockEventsQuery;

vi.mock('@/hooks/useAllianceProvisioning', () => ({
  useAllianceScimEvents: () => eventsReturn,
}));

const query = (pages: AllianceScimEventPage[]): MockEventsQuery => ({
  data: { pages },
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
});

const event = (over: Partial<AllianceScimEvent> = {}): AllianceScimEvent => ({
  id: 1,
  eventType: 'user_provisioned',
  severity: 'info',
  actorType: 'idp',
  actorTokenId: null,
  actorUserId: null,
  targetUserId: 10,
  targetEmail: 'alice@x.test',
  idpGroupExternalId: null,
  beforeRole: null,
  afterRole: 'alliance_agent',
  outcome: 'success',
  detail: null,
  createdAt: '2026-08-17T12:00:00.000Z',
  ...over,
});

const telemetry = (hasActiveAdmin: boolean): AllianceScimTelemetry => ({
  config: { enabled: true, allowScimAccountLinking: false },
  tokens: { total: 1, active: 1, revoked: 0, lastUsedAt: null },
  groups: { total: 1, memberships: 1, lastSyncedAt: null },
  admins: { activeAdminCount: hasActiveAdmin ? 1 : 0, hasActiveAdmin },
  events: { total: 1, lastEventAt: null },
  notes: [],
});

afterEach(cleanup);

describe('ScimEventLedgerCard', () => {
  it('renders NOTHING when the backend has no ledger endpoint (available:false)', () => {
    eventsReturn = query([{ available: false, events: [], nextCursor: null }]);
    const { container } = render(<ScimEventLedgerCard allianceId={1} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Activity')).toBeNull();
  });

  it('renders the feed when the endpoint is available (control for the 404 case)', () => {
    eventsReturn = query([{ available: true, events: [event()], nextCursor: null }]);
    render(<ScimEventLedgerCard allianceId={1} />);
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('User provisioned')).toBeInTheDocument();
    expect(screen.getByText('alice@x.test')).toBeInTheDocument();
  });

  it('shows a role transition (before → after) for an elevation event', () => {
    eventsReturn = query([
      {
        available: true,
        events: [
          event({
            id: 2,
            eventType: 'role_elevated',
            severity: 'warning',
            beforeRole: 'alliance_agent',
            afterRole: 'alliance_admin',
          }),
        ],
        nextCursor: null,
      },
    ]);
    render(<ScimEventLedgerCard allianceId={1} />);
    expect(screen.getByText('Role elevated')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('renders a provisioning rejection with its reason (not hidden silently)', () => {
    eventsReturn = query([
      {
        available: true,
        events: [
          event({
            id: 3,
            eventType: 'provision_rejected',
            severity: 'warning',
            outcome: 'rejected',
            afterRole: null,
            targetEmail: 'smith@taconet.info',
            // The BE's real string: the reason has to NAME the cause and the remedy —
            // the old 'This account cannot be provisioned by SCIM.' rendered fine and
            // told the admin reading it nothing at all.
            detail: {
              reason:
                'smith@taconet.info is a platform administrator in Odly, and SCIM never ' +
                'takes over a platform-admin account. Provision this person from a ' +
                'different email address, or change their platform role to User in the ' +
                'platform console (Console → Users) and re-push from your IdP.',
            },
          }),
        ],
        nextCursor: null,
      },
    ]);
    render(<ScimEventLedgerCard allianceId={1} />);
    expect(screen.getByText('Provisioning rejected')).toBeInTheDocument();
    expect(screen.getByText('smith@taconet.info')).toBeInTheDocument();
    expect(screen.getByText(/platform administrator/i)).toBeInTheDocument();
    expect(screen.getByText(/platform role to User/i)).toBeInTheDocument();
  });

  it('labels a skipped group member instead of showing the raw event type', () => {
    // `eventLabel` falls back to the bare type string, so an unlabelled BE event reaches
    // the admin as 'group_member_skipped'. This is the test that keeps the two in step.
    eventsReturn = query([
      {
        available: true,
        events: [
          event({
            id: 4,
            eventType: 'group_member_skipped',
            severity: 'warning',
            outcome: 'skipped',
            afterRole: null,
            targetEmail: 'jerry@taconet.info',
            detail: {
              skipped: 1,
              reason:
                'The IdP listed these members, but they are not provisioned into this ' +
                'alliance, so they were left out of the group.',
            },
          }),
        ],
        nextCursor: null,
      },
    ]);
    render(<ScimEventLedgerCard allianceId={1} />);
    expect(screen.getByText('Group members skipped')).toBeInTheDocument();
    expect(screen.queryByText('group_member_skipped')).not.toBeInTheDocument();
    expect(screen.getByText(/not provisioned into this alliance/i)).toBeInTheDocument();
  });

  it('shows the empty state when the endpoint is available but has no events', () => {
    eventsReturn = query([{ available: true, events: [], nextCursor: null }]);
    render(<ScimEventLedgerCard allianceId={1} />);
    expect(screen.getByText(/No connector activity yet/i)).toBeInTheDocument();
  });

  it('shows the last-admin lockout banner IFF telemetry reports no active admin', () => {
    eventsReturn = query([{ available: true, events: [event()], nextCursor: null }]);

    // Must show when orphaned.
    const orphaned = render(<ScimEventLedgerCard allianceId={1} telemetry={telemetry(false)} />);
    expect(screen.getByText(/No active alliance admin/i)).toBeInTheDocument();
    orphaned.unmount();

    // CONTROL: must NOT show when an admin remains.
    render(<ScimEventLedgerCard allianceId={1} telemetry={telemetry(true)} />);
    expect(screen.queryByText(/No active alliance admin/i)).toBeNull();
  });
});
