import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AllianceConsoleRoute } from './components/auth/AllianceConsoleRoute';
import { GlobalAdminRedirect } from './components/auth/GlobalAdminRedirect';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { FeatureGate } from './components/common/FeatureGate';
import { useRolePermissionMatrix } from '@/hooks/useRolePermissionMatrix';
import { CONSOLE_SECTIONS, PLATFORM_SECTIONS } from './components/console/consoleSections';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LegacyWorkspaceRedirect } from './components/layout/LegacyWorkspaceRedirect';
import { WorkspaceGate } from './components/layout/WorkspaceGate';
import { Button } from './components/ui/Button';
import { useBackendVersion } from './hooks/useBackendVersion';
// Eager load critical routes
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SignupPage } from './pages/SignupPage';
import { CreateWorkspacePage } from './pages/CreateWorkspacePage';
import { SsoCallbackPage } from './pages/SsoCallbackPage';
import { TrackingPage } from './pages/TrackingPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { userService } from './services/user.service';
import { useAuthStore } from './stores/authStore';
import { Permission } from './types/roles';

// Lazy load non-critical routes
const MessagesPage = lazy(() =>
  import('./pages/MessagesPage').then((mod) => ({ default: mod.MessagesPage }))
);
const MessageDetailPage = lazy(() =>
  import('./pages/MessageDetailPage').then((mod) => ({ default: mod.MessageDetailPage }))
);
const TicketsPage = lazy(() =>
  import('./pages/TicketsPage').then((mod) => ({ default: mod.TicketsPage }))
);
const TicketDetailPage = lazy(() =>
  import('./pages/TicketDetailPage').then((mod) => ({ default: mod.TicketDetailPage }))
);
const CreateTicketPage = lazy(() =>
  import('./pages/CreateTicketPage').then((mod) => ({ default: mod.CreateTicketPage }))
);
const EditTicketPage = lazy(() =>
  import('./pages/EditTicketPage').then((mod) => ({ default: mod.EditTicketPage }))
);
const EditUserPage = lazy(() =>
  import('./pages/EditUserPage').then((mod) => ({ default: mod.EditUserPage }))
);
const StatisticsPage = lazy(() =>
  import('./pages/StatisticsPage').then((mod) => ({ default: mod.StatisticsPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage }))
);
const UsersPage = lazy(() =>
  import('./pages/UsersPage').then((mod) => ({ default: mod.UsersPage }))
);
const OrganizationPage = lazy(() =>
  import('./pages/OrganizationPage').then((mod) => ({ default: mod.OrganizationPage }))
);
const AuditLogsPage = lazy(() =>
  import('./pages/AuditLogsPage').then((mod) => ({ default: mod.AuditLogsPage }))
);
const SubscriptionPage = lazy(() =>
  import('./pages/SubscriptionPage').then((mod) => ({ default: mod.SubscriptionPage }))
);
const PricingPage = lazy(() =>
  import('./pages/PricingPage').then((mod) => ({ default: mod.PricingPage }))
);
const UsageStatsPage = lazy(() =>
  import('./pages/UsageStatsPage').then((mod) => ({ default: mod.UsageStatsPage }))
);
const KnowledgeBasePage = lazy(() =>
  import('./pages/KnowledgeBasePage').then((mod) => ({ default: mod.KnowledgeBasePage }))
);
const BillingDashboardPage = lazy(() =>
  import('./pages/BillingDashboardPage').then((mod) => ({ default: mod.BillingDashboardPage }))
);
const NeedsRoutingPage = lazy(() =>
  import('./pages/NeedsRoutingPage').then((mod) => ({ default: mod.NeedsRoutingPage }))
);
const OnboardingPage = lazy(() =>
  import('./pages/OnboardingPage').then((mod) => ({ default: mod.OnboardingPage }))
);
const SLADashboardPage = lazy(() =>
  import('./pages/SLADashboardPage').then((mod) => ({ default: mod.SLADashboardPage }))
);
// Alliance admin console (Phase 5) — org-agnostic shell above the org-switcher.
const ConsolePage = lazy(() =>
  import('./pages/ConsolePage').then((mod) => ({ default: mod.ConsolePage }))
);
const AdminShell = lazy(() =>
  import('./components/console/AdminShell').then((mod) => ({ default: mod.AdminShell }))
);
// Per-workspace management shell (B2) — a global admin manages ANY workspace's Users +
// config in-console, reusing UsersPage/OrganizationPage embedded. TOP-LEVEL (sibling of
// /console/platform) so the platform scope never drops X-Organization-Context here.
const WorkspaceShell = lazy(() =>
  import('./components/console/WorkspaceShell').then((mod) => ({ default: mod.WorkspaceShell }))
);
const WorkspaceDepartmentsPage = lazy(() =>
  import('./pages/console/WorkspaceDepartmentsPage').then((mod) => ({
    default: mod.WorkspaceDepartmentsPage,
  }))
);

const LoadingFallback = () => (
  <div className="flex justify-center items-center min-h-screen bg-background">
    <div className="text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

// `/signup` serves two flows: an invitation-accept page when the URL carries a
// `token=` (query or hash — the link BE emails to invited users), and the public
// self-serve "create a workspace" page otherwise.
const SignupRoute = () => {
  const hasInviteToken =
    new URLSearchParams(window.location.search).has('token') ||
    new URLSearchParams(window.location.hash.replace(/^#/, '')).has('token');
  return hasInviteToken ? <SignupPage /> : <CreateWorkspacePage />;
};

const PrivateRoute = ({ children }: { children: JSX.Element }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  return isAuthenticated && user ? children : <Navigate to="/login" />;
};

/**
 * Gate for customer-facing billing pages (Subscription, Pricing, Usage Stats).
 * The nav hides these when billing is off, but the routes must be guarded too so
 * a hand-typed URL can't reach them. `billingEnabled` is the authoritative BE
 * signal (a billing provider is configured); false on self-hosted and on managed
 * boxes not yet activated. We wait for the health call to settle before deciding
 * so a legit managed user isn't bounced during the in-flight window.
 */
const BillingRoute = ({ children }: { children: JSX.Element }) => {
  const { data: backendVersion, isLoading } = useBackendVersion();
  if (isLoading) return <LoadingFallback />;
  return backendVersion?.billingEnabled ? children : <Navigate to="/dashboard" replace />;
};

const AppRoutes = () => {
  // Adopt the server's role → permission table, once, here. Everything that renders from
  // permissions reads it via usePermissions; this is the only place that fetches it.
  useRolePermissionMatrix();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const [restoreFailed, setRestoreFailed] = useState(false);
  // After page reload the persisted user has no role/organizationRole (intentionally not stored).
  // Re-fetch the profile from the server to restore those fields so ProtectedRoute works correctly.
  useEffect(() => {
    if (!(isAuthenticated && user && !user.role)) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const MAX_RETRIES = 4;
    setRestoreFailed(false);
    const run = () => {
      userService
        .getCurrentUser()
        .then((freshUser) => {
          if (!cancelled) setUser(freshUser);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // Only a genuine auth failure (401/403) should end the session. A transient
          // network error or 5xx during profile restore must NOT log the user out
          // (W2-M28) — retry with backoff instead of dropping the session on a blip.
          //
          // 🪤 Read `status`, NOT `err.response.status`. The api-client interceptor
          // rebuilds the error and copies `status`/`data` onto it, so `.response` is
          // always undefined here. That made this whole ladder collapse into its
          // retry arm: a real 401 never logged out, and a 402 was retried four times
          // and then reported as "check your connection".
          const status = (err as { status?: number } | null)?.status;
          if (status === 401 || status === 403) {
            logout();
          } else if (status === 402) {
            // Subscription inactive. Retrying cannot help — payment state will not
            // change between backoffs — and the interceptor has already armed the
            // subscription gate, which explains the situation properly. Falling
            // through to the generic failure would bury that behind a connection
            // error the user cannot act on.
          } else if (attempt < MAX_RETRIES) {
            attempt += 1;
            timer = setTimeout(run, 1000 * attempt);
          } else {
            // Sustained non-auth failure (e.g. backend outage): don't spin forever AND don't
            // drop the session — surface a recoverable error so the user can retry.
            setRestoreFailed(true);
          }
        });
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, logout, setUser, user]);

  // Gate route evaluation while an authenticated user is still missing its role — the
  // reload window before the profile refetch lands. This MUST NOT depend on an effect-set
  // flag: effects run after the first commit, but a role-gated <Navigate> renders DURING
  // that first commit and would bounce the URL before the gate ever engaged (audit HIGH,
  // Wave2:49). Keying purely on `!user.role` blocks on the very first render and clears
  // automatically once the refetch populates role.
  if (isAuthenticated && user && !user.role) {
    if (restoreFailed) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            gap: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p>Couldn&apos;t load your profile. Check your connection and try again.</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      );
    }
    return <LoadingFallback />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <LoginPage />}
      />
      <Route
        path="/signup"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <SignupRoute />}
      />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/forgot-password"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <ForgotPasswordPage />}
      />
      <Route
        path="/reset-password"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <ResetPasswordPage />}
      />
      <Route path="/oauth/gmail/callback" element={<OAuthCallbackPage />} />
      {/* SSO handoff landing — PUBLIC (user is mid-auth; reads JWT from the
          scrubbed URL fragment). Must NOT sit behind PrivateRoute. */}
      <Route path="/sso/callback" element={<SsoCallbackPage />} />
      {/* Public conversation tracking (#20). No auth — token in query string. */}
      <Route
        path="/track/:orgSlug/:deptSlug/:conversationId"
        element={<TrackingPage />}
      />
      {/* Preview / demo of the tracking page with mock data (no conv id / token).
          Useful for design review, screenshots, customer-facing demos. */}
      <Route path="/track/:orgSlug/:deptSlug" element={<TrackingPage />} />
      {/* Alliance admin console (Phase 5). `/console` resolves the caller's first
          administered alliance; `/console/alliance/:id` mounts the AdminShell
          (own chrome) behind the alliance-admin route guard, with one child route
          per console section (sections drive both nav + routes). */}
      <Route
        path="/console"
        element={
          <PrivateRoute>
            <AllianceConsoleRoute>
              <Suspense fallback={<LoadingFallback />}>
                <ConsolePage />
              </Suspense>
            </AllianceConsoleRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="/console/alliance/:allianceId"
        element={
          <PrivateRoute>
            <AllianceConsoleRoute>
              <ProtectedRoute allianceAdmin>
                <Suspense fallback={<LoadingFallback />}>
                  <AdminShell />
                </Suspense>
              </ProtectedRoute>
            </AllianceConsoleRoute>
          </PrivateRoute>
        }
      >
        {CONSOLE_SECTIONS.map((section) => {
          const SectionElement = section.element;
          return (
            <Route
              key={section.id}
              index={section.index}
              path={section.index ? undefined : section.path}
              element={<SectionElement />}
            />
          );
        })}
      </Route>
      {/* Platform (global-admin) console — same AdminShell, platform scope. Gated on
          the global-admin role; sections drive both the shell nav and these routes. */}
      <Route
        path="/console/platform"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredRole="admin">
              <Suspense fallback={<LoadingFallback />}>
                <AdminShell scope="platform" />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      >
        {PLATFORM_SECTIONS.map((section) => {
          const SectionElement = section.element;
          return (
            <Route
              key={section.id}
              index={section.index}
              path={section.index ? undefined : section.path}
              element={<SectionElement />}
            />
          );
        })}
      </Route>
      {/* Per-workspace management shell. TOP-LEVEL — NOT nested under
          /console/platform — so the platform scope (which drops X-Organization-Context)
          never applies here. WorkspaceShell points the org context at :orgId and clears
          scope on mount; the embedded UsersPage/OrganizationPage then make org-scoped
          calls (invite, skills, permission overrides, config) against that workspace.
          Gate = `allianceAdmin` (global-admin OR an active alliance_admin membership), NOT
          global-admin-only: an alliance_admin is materialized as `org_admin` of every
          member workspace (roleMapping D-04 alliance_admin→org_admin via the fan-out
          reconciler), so managing one is a right they already hold. The per-workspace
          authorization is enforced by the BE org-context on each embedded call (a caller
          with no `user_organizations` row for :orgId gets 403), so this is only a UX gate. */}
      <Route
        path="/console/workspace/:orgId"
        element={
          <PrivateRoute>
            <ProtectedRoute allianceAdmin>
              <Suspense fallback={<LoadingFallback />}>
                <WorkspaceShell />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<LoadingFallback />}>
              <UsersPage embedded />
            </Suspense>
          }
        />
        {/* Editing a member stays INSIDE the shell. The top-level /users/:id/edit route
            would leave it, and with it the org context WorkspaceShell points at :orgId
            and the WorkspaceScope that lets usePermissions evaluate against the target
            workspace — so the form would silently act on the caller's home org. */}
        <Route
          path="users/:id/edit"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <EditUserPage embedded />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <OrganizationPage embedded />
            </Suspense>
          }
        />
        {/* Plan-budgeted departments lever — global-admin only (the BE endpoints are
            requireGlobalAdmin; the nav link is hidden for alliance_admins). */}
        <Route
          path="departments"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <WorkspaceDepartmentsPage />
            </Suspense>
          }
        />
      </Route>
      {/* ── Workspace-scoped app ──────────────────────────────────────────────
          Every authenticated screen lives under `/w/:slug` so a shared link says
          WHICH workspace it belongs to. Before this, `?id=MKT-170` resolved against
          the recipient's last-used workspace — and because public ids are unique per
          org (counter is per department), the same id exists in several workspaces:
          `INF` and `SUP` each appear in six on prod, and 54 ids already resolve in
          more than one. So the wrong workspace did not 404, it opened a different
          real conversation. WorkspaceGate resolves the slug, checks membership, and
          points the store at the URL rather than the other way round. */}
      <Route path="/w/:slug" element={<WorkspaceGate />}>
      <Route
        path="dashboard"
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        }
      />
      {/* Onboarding wizard — full page, deliberately outside Layout so it can
          never stack with SubscriptionGateOverlay. */}
      <Route
        path="onboarding"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <OnboardingPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="messages"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <MessagesPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="messages/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <MessageDetailPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="knowledge-base"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <KnowledgeBasePage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="tickets"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <TicketsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="tickets/create"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <CreateTicketPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="tickets/edit/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <EditTicketPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="tickets/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <TicketDetailPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="statistics"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <StatisticsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="sla"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_STATISTICS}>
              <Suspense fallback={<LoadingFallback />}>
                <SLADashboardPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="settings"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <SettingsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="users/:id/edit"
        element={
          <PrivateRoute>
            {/* Same gate as /users, its only entry point — editing a member is one of the
                actions that page offers, not a wider capability. */}
            <ProtectedRoute requiredPermission={Permission.VIEW_USERS}>
              <Suspense fallback={<LoadingFallback />}>
                <EditUserPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="users"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_USERS}>
              {/* Per-workspace user management: invite, create, edit, delete, routing
                  skills, and permission overrides. Global admins KEEP this page (they
                  select the target workspace via the OrganizationSwitcher) — the platform
                  console's Users section is only a cross-org directory + global-role
                  editor and can't perform these org-scoped actions. */}
              <Suspense fallback={<LoadingFallback />}>
                <UsersPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      {/* Workspace details moved into Settings › Workspace › Details — the standalone
          nav tab was retired. Redirect the old route so bookmarks/links don't 404.
          The destination (Settings) enforces its own view/edit permissions. */}
      <Route
        path="organization"
        element={<Navigate to="/settings#organization/details" replace />}
      />
      {/* Email Templates moved into the platform console (Platform › Email Templates).
          Redirect the old route; the console gates non-admins to a clean access state. */}
      <Route
        path="email-templates"
        element={<Navigate to="/console/platform/email-templates" replace />}
      />
      <Route
        path="audit-logs"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_AUDIT_LOGS}>
              {/* P3: global admins view audit in the platform console; org admins
                  keep this org-scoped audit page. */}
              <GlobalAdminRedirect to="/console/platform/audit">
                <Suspense fallback={<LoadingFallback />}>
                  <AuditLogsPage />
                </Suspense>
              </GlobalAdminRedirect>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="subscription"
        element={
          <PrivateRoute>
            <BillingRoute>
              <ProtectedRoute requiredPermission={Permission.VIEW_SUBSCRIPTION}>
                <Suspense fallback={<LoadingFallback />}>
                  <SubscriptionPage />
                </Suspense>
              </ProtectedRoute>
            </BillingRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="pricing"
        element={
          <PrivateRoute>
            <BillingRoute>
              <Suspense fallback={<LoadingFallback />}>
                <PricingPage />
              </Suspense>
            </BillingRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="usage-stats"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_USAGE_STATS}>
              <Suspense fallback={<LoadingFallback />}>
                <UsageStatsPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="billing"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_BILLING}>
              <FeatureGate flag="ui.billing_intelligence" title="Billing Intelligence">
                <Suspense fallback={<LoadingFallback />}>
                  <BillingDashboardPage />
                </Suspense>
              </FeatureGate>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      {/* Deleted Messages folded into Settings › System (sub-tab). Redirect the old route. */}
      <Route
        path="deleted-messages"
        element={<Navigate to="/settings#system/deleted" replace />}
      />
      <Route
        path="needs-routing"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_MESSAGES}>
              <Suspense fallback={<LoadingFallback />}>
                <NeedsRoutingPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      {/* Orphaned Outbound folded into Settings › System (sub-tab). Redirect the old route. */}
      <Route
        path="orphaned-outbound"
        element={<Navigate to="/settings#system/orphaned" replace />}
      />
      </Route>
      {/* P3: the old '/admin' dashboard was removed; its Plans/Usage tabs now live in
          the platform console. Redirect any lingering '/admin' link there (the console
          gates non-admins) instead of dropping to a 404. */}
      <Route path="/admin" element={<Navigate to="/console/platform" replace />} />
      {/* Root has no workspace yet; the redirect resolves one and lands on it. */}
      <Route path="/" element={<LegacyWorkspaceRedirect />} />
      {/* Pre-workspace URLs — bookmarks, links in email, anything this app emitted
          before the slug existed — are rewritten onto the current workspace instead
          of 404ing. See LegacyWorkspaceRedirect for what that can and cannot fix. */}
      <Route path="*" element={<LegacyWorkspaceRedirect />} />
    </Routes>
  );
};

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
    <Toaster position="top-right" richColors closeButton />
  </BrowserRouter>
);

export default App;
