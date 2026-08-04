import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

import { Landing } from "@/pages/Landing";
import { Properties } from "@/pages/Properties";
import { PropertyDetail } from "@/pages/PropertyDetail";
import { Marketplace } from "@/pages/Marketplace";
import { Discover } from "@/pages/Discover";
import { About } from "@/pages/About";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Dashboard } from "@/pages/Dashboard";

import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { AdminProperties } from "@/pages/admin/AdminProperties";
import { AdminUsers } from "@/pages/admin/AdminUsers";
import { AdminAgents } from "@/pages/admin/AdminAgents";
import { AdminMarketplace } from "@/pages/admin/AdminMarketplace";
import { AdminAuditLog } from "@/pages/admin/AdminAuditLog";

function PublicShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminOnly({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-neutral-200 border-t-[color:var(--amass-red)] rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<PublicShell><Landing /></PublicShell>} />
          <Route path="/properties" element={<PublicShell><Properties /></PublicShell>} />
          <Route path="/properties/:id" element={<PublicShell><PropertyDetail /></PublicShell>} />
          <Route path="/marketplace" element={<PublicShell><Marketplace /></PublicShell>} />
          <Route path="/discover" element={<PublicShell><Discover /></PublicShell>} />
          <Route path="/about" element={<PublicShell><About /></PublicShell>} />
          <Route path="/login" element={<PublicShell><Login /></PublicShell>} />
          <Route path="/register" element={<PublicShell><Register /></PublicShell>} />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <PublicShell>
                  <Dashboard />
                </PublicShell>
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminOnly>
                <AdminLayout />
              </AdminOnly>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="properties" element={<AdminProperties />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="agents" element={<AdminAgents />} />
            <Route path="marketplace" element={<AdminMarketplace />} />
            <Route path="audit-log" element={<AdminAuditLog />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
