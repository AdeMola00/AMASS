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
import Placeholder from "@/pages/Placeholder";

const PLACEHOLDER_PATHS = [
  "analytics", "reports", "property-owners", "developers", "construction", "home-marketplace",
  "transactions", "payments", "subscriptions", "messages", "notifications", "ai",
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
