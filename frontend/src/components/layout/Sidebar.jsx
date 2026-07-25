import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { NAV_GROUPS } from "@/config/nav";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16 shrink-0" data-testid="sidebar-brand">
      <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-heading font-extrabold text-lg">A</div>
      <div className="leading-tight">
        <div className="font-heading font-extrabold tracking-tight text-[15px]">AMASS</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin Portal</div>
      </div>
    </div>
  );
}

export function SidebarContent({ onNavigate }) {
  const { can } = useAuth();
  const location = useLocation();

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <BrandMark />
      <nav className="flex-1 overflow-y-auto amass-scroll px-3 pb-6 space-y-6">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => can(i.module, "view"));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      end={item.path === "/admin"}
                      onClick={onNavigate}
                      data-testid={`nav-${item.key}`}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                      <span className="truncate flex-1">{item.label}</span>
                      {active && (
                        <motion.div layoutId="nav-dot" className="h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                      {!item.built && !active && (
                        <Lock className="h-3 w-3 opacity-40 group-hover:opacity-70" />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-border text-[11px] text-muted-foreground">
        AMASS OS · v0.1
      </div>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 h-screen sticky top-0">
      <SidebarContent />
    </aside>
  );
}
