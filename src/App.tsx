import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
// Eager load critical routes
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
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
const StatisticsPage = lazy(() =>
  import('./pages/StatisticsPage').then((mod) => ({ default: mod.StatisticsPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage }))
);
const UsersPage = lazy(() => import('./pages/UsersPage').then((mod) => ({ default: mod.UsersPage })));
const OrganizationPage = lazy(() =>
  import('./pages/OrganizationPage').then((mod) => ({ default: mod.OrganizationPage }))
);
const EmailTemplatesPage = lazy(() =>
  import('./pages/EmailTemplatesPage').then((mod) => ({ default: mod.EmailTemplatesPage }))
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
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((mod) => ({ default: mod.AdminDashboardPage }))
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
const SLADashboardPage = lazy(() =>
  import('./pages/SLADashboardPage').then((mod) => ({ default: mod.SLADashboardPage }))
);

const LoadingFallback = () => (
  <div className="flex justify-center items-center min-h-screen bg-background">
    <div className="text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const PrivateRoute = ({ children }: { children: JSX.Element }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const AppRoutes = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <LoginPage />}
      />
      <Route
        path="/signup"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <SignupPage />}
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
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <MessagesPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/messages/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <MessageDetailPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/knowledge-base"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <KnowledgeBasePage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <TicketsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/tickets/create"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <CreateTicketPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/tickets/edit/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <EditTicketPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <TicketDetailPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/statistics"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <StatisticsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/sla"
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
      <Route path="/team-stats" element={<Navigate to="/statistics#team" replace />} />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <SettingsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/users"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_USERS}>
              <Suspense fallback={<LoadingFallback />}>
                <UsersPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="/organization"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <OrganizationPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/email-templates"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <EmailTemplatesPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_AUDIT_LOGS}>
              <Suspense fallback={<LoadingFallback />}>
                <AuditLogsPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <AdminDashboardPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/subscription"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_SUBSCRIPTION}>
              <Suspense fallback={<LoadingFallback />}>
                <SubscriptionPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route
        path="/pricing"
        element={
          <PrivateRoute>
            <Suspense fallback={<LoadingFallback />}>
              <PricingPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/usage-stats"
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
        path="/billing"
        element={
          <PrivateRoute>
            <ProtectedRoute requiredPermission={Permission.VIEW_BILLING}>
              <Suspense fallback={<LoadingFallback />}>
                <BillingDashboardPage />
              </Suspense>
            </ProtectedRoute>
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
};

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AppRoutes />
  </BrowserRouter>
);

export default App;
