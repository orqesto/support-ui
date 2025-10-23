import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Permission } from './types/roles';

// Eager load critical routes
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { DashboardPage } from './pages/DashboardPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';

// Lazy load non-critical routes
const MessagesPage = lazy(() => import('./pages/MessagesPage').then(m => ({ default: m.MessagesPage })));
const TicketsPage = lazy(() => import('./pages/TicketsPage').then(m => ({ default: m.TicketsPage })));
const CreateTicketPage = lazy(() => import('./pages/CreateTicketPage').then(m => ({ default: m.CreateTicketPage })));
const EditTicketPage = lazy(() => import('./pages/EditTicketPage').then(m => ({ default: m.EditTicketPage })));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage').then(m => ({ default: m.StatisticsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const OrganizationPage = lazy(() => import('./pages/OrganizationPage').then(m => ({ default: m.OrganizationPage })));
const EmailTemplatesPage = lazy(() => import('./pages/EmailTemplatesPage').then(m => ({ default: m.EmailTemplatesPage })));

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
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
      <Route
        path="/verify-email"
        element={<VerifyEmailPage />}
      />
      <Route
        path="/oauth/gmail/callback"
        element={<OAuthCallbackPage />}
      />
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
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;
