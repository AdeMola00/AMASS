import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AmassLogo } from "@/components/AmassLogo";
import { LayoutDashboard, Building2, Users, UserCheck, ShoppingBag, FileText, ArrowLeft, LogOut, Paintbrush, Settings, Megaphone } from "lucide-react";

const links = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/properties", label: "Properties", icon: Building2 },
  { to: "/admin/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/agents", label: "Agents", icon: UserCheck },
  { to: "/admin/cms", label: "Landing CMS", icon: Paintbrush },
  { to: "/admin/notifications", label: "Broadcasts", icon: Megaphone },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/audit-log", label: "Audit log", icon: FileText },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-neutral-50" data-testid="admin-layout">
      <aside className="w-64 shrink-0 bg-neutral-900 text-white flex flex-col" data-testid="admin-sidebar">
        <div className="p-6 border-b border-white/10">
          <AmassLogo inverse />
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--amass-red)]">
            Admin Portal
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              data-testid={`admin-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[color:var(--amass-red)] text-white"
                    : "text-neutral-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <l.icon size={16} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 space-y-1">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-neutral-400 hover:bg-white/5 hover:text-white"
            data-testid="admin-back-to-site"
          >
            <ArrowLeft size={16} /> Back to site
          </Link>
          <button
            onClick={() => { signOut(); navigate("/"); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-neutral-400 hover:bg-white/5 hover:text-white"
            data-testid="admin-signout"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-16 border-b border-neutral-200 bg-white px-8 flex items-center justify-between" data-testid="admin-topbar">
          <div className="text-sm text-neutral-500">
            Signed in as <span className="font-semibold text-neutral-900">{user?.email}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-[color:var(--amass-red)] text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--amass-red)] animate-pulse" />
            Live production
          </div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
