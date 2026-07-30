import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "@/components/layout/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import LandingCMS from "@/pages/LandingCMS";
import RolesPermissions from "@/pages/RolesPermissions";
import Settings from "@/pages/Settings";
import Properties from "@/pages/Properties";
import PropertyVerification from "@/pages/PropertyVerification";
import Agents from "@/pages/Agents";
import Users from "@/pages/Users";
import Marketplace from "@/pages/Marketplace";
import AppConfig from "@/pages/AppConfig";
import TokenEconomy from "@/pages/TokenEconomy";
import MediaLibrary from "@/pages/MediaLibrary";
import Analytics from "@/pages/Analytics";
import Notifications from "@/pages/Notifications";
import Reports from "@/pages/Reports";
import AIManagement from "@/pages/AIManagement";
import Developers from "@/pages/Developers";
import PropertyOwners from "@/pages/PropertyOwners";
import Placeholder from "@/pages/Placeholder";

const PLACEHOLDER_PATHS = [
  "construction", "home-marketplace",
  "transactions", "payments", "subscriptions", "messages",
];

function App() {
  return (
    <div className="App">
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/login" element={<Login />} />
              <Route
                path="/admin"
                element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}
              >
                <Route index element={<Dashboard />} />
                <Route path="leads" element={<Leads />} />
                <Route path="cms" element={<LandingCMS />} />
                <Route path="properties" element={<Properties />} />
                <Route path="property-verification" element={<PropertyVerification />} />
                <Route path="agents" element={<Agents />} />
                <Route path="users" element={<Users />} />
                <Route path="marketplace" element={<Marketplace />} />
                <Route path="app-config" element={<AppConfig />} />
                <Route path="tokens" element={<TokenEconomy />} />
                <Route path="media" element={<MediaLibrary />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="reports" element={<Reports />} />
                <Route path="ai" element={<AIManagement />} />
                <Route path="developers" element={<Developers />} />
                <Route path="property-owners" element={<PropertyOwners />} />
                <Route path="roles" element={<RolesPermissions />} />
                <Route path="settings" element={<Settings />} />
                {PLACEHOLDER_PATHS.map((p) => (
                  <Route key={p} path={p} element={<Placeholder />} />
                ))}
              </Route>
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </ThemeProvider>
    </div>
  );
}

export default App;
