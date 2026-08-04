import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AmassLogo } from "@/components/AmassLogo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, X, User, LogOut, LayoutDashboard, ShieldCheck } from "lucide-react";

const links = [
  { to: "/properties", label: "Properties" },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/discover", label: "Discover" },
  { to: "/about", label: "About" },
];

export function Nav() {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 w-full amass-glass border-b border-neutral-200/60"
      data-testid="site-nav"
    >
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center" data-testid="nav-logo">
          <AmassLogo />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              data-testid={`nav-link-${l.label.toLowerCase()}`}
              className={({ isActive }) =>
                `px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                  isActive
                    ? "text-[color:var(--amass-red)] bg-red-50"
                    : "text-neutral-700 hover:text-black hover:bg-neutral-100"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-300 transition-colors"
                  data-testid="nav-user-menu"
                >
                  <div className="w-7 h-7 rounded-full bg-[color:var(--amass-red)] text-white flex items-center justify-center text-xs font-semibold">
                    {(user.full_name || user.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate max-w-[120px]">
                    {user.full_name?.split(" ")[0] || user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-semibold">{user.full_name}</div>
                  <div className="text-xs text-neutral-500 truncate">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/dashboard")} data-testid="menu-dashboard">
                  <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")} data-testid="menu-admin">
                    <ShieldCheck className="mr-2 h-4 w-4" /> Admin Portal
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  data-testid="menu-signout"
                  className="text-red-600 focus:text-red-700"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" data-testid="nav-signin">
                  Sign in
                </Button>
              </Link>
              <Link to="/register">
                <Button
                  size="sm"
                  className="amass-btn-primary rounded-full px-5"
                  data-testid="nav-signup"
                >
                  Get started
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden p-2"
          onClick={() => setOpen((v) => !v)}
          data-testid="nav-mobile-toggle"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-neutral-200/60 bg-white">
          <div className="px-6 py-4 space-y-2">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="block py-2 text-sm font-medium text-neutral-700 hover:text-[color:var(--amass-red)]"
                data-testid={`mobile-nav-${l.label.toLowerCase()}`}
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-3 flex gap-2 border-t border-neutral-100">
              {user ? (
                <>
                  <Button variant="outline" onClick={() => { setOpen(false); navigate("/dashboard"); }} className="flex-1">
                    Dashboard
                  </Button>
                  <Button variant="ghost" onClick={() => { setOpen(false); signOut(); navigate("/"); }} className="flex-1">
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setOpen(false)} className="flex-1">
                    <Button variant="outline" className="w-full">Sign in</Button>
                  </Link>
                  <Link to="/register" onClick={() => setOpen(false)} className="flex-1">
                    <Button className="w-full amass-btn-primary">Get started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
