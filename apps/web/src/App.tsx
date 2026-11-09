import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useApp } from "./lib/app";
import { Spinner } from "./components/ui";
import { AppLayout } from "./components/Layout";
import { HomePage } from "./pages/Home";
import { ForgotPage, LoginPage, RegisterPage, ResetPage } from "./pages/Auth";
import { DashboardPage } from "./pages/Dashboard";
import { AdminPage } from "./pages/Admin";
import { ProfilePage } from "./pages/Profile";
import { EditorPage } from "./pages/Editor";
import { PresentPage } from "./pages/Present";
import { ScreenPage } from "./pages/Screen";
import { ParticipantPage } from "./pages/Participant";
import { ThemesPage } from "./pages/Themes";
import { SessionListPage, SessionResultsPage } from "./pages/Sessions";

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useApp();
  const loc = useLocation();
  if (loading) return <Spinner className="min-h-screen" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (admin && user.role !== "ADMIN") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function App() {
  const { loading } = useApp();
  if (loading) return <Spinner className="min-h-screen" />;
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/reset/:token" element={<ResetPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/themes" element={<ThemesPage />} />
        <Route path="/sessions/p/:id" element={<SessionListPage />} />
        <Route path="/sessions/:id" element={<SessionResultsPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth admin>
              <AdminPage />
            </RequireAuth>
          }
        />
      </Route>
      <Route
        path="/edit/:id"
        element={
          <RequireAuth>
            <EditorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/present/:id"
        element={
          <RequireAuth>
            <PresentPage />
          </RequireAuth>
        }
      />
      <Route
        path="/screen/:id"
        element={
          <RequireAuth>
            <ScreenPage />
          </RequireAuth>
        }
      />
      <Route path="/:code" element={<ParticipantPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
