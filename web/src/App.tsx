import { BrowserRouter, Routes, Route } from "react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { InvitationsPage } from "@/pages/InvitationsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TrustedAgentsPage } from "@/pages/TrustedAgentsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="app" element={<DashboardLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="c/:id" element={<DashboardPage />} />
            <Route path="invitations" element={<InvitationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="trusted-agents" element={<TrustedAgentsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
