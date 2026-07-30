import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileTabBar from "./MobileTabBar";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { findNavItem } from "@/config/nav";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

function Guarded({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const item = findNavItem(location.pathname);
  if (item && !can(item.module)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="not-authorized">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-heading text-xl font-bold tracking-tight">Not authorized</h2>
        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
          You don't have permission to access {item.label}. Contact a Super Admin to request access.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => navigate("/admin")}>Back to Dashboard</Button>
      </div>
    );
  }
  return children;
}

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1600px] w-full mx-auto">
          <Guarded><Outlet /></Guarded>
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
