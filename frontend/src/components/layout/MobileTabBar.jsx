import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarContent } from "./Sidebar";
import { ALL_ITEMS } from "@/config/nav";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const PRIMARY = ["dashboard", "leads", "properties", "cms", "agents"];
const SHORT = {
  dashboard: "Home", leads: "Leads", properties: "Listings", cms: "Content",
  agents: "Agents", users: "Users", roles: "Roles", settings: "Settings",
};

export default function MobileTabBar() {
  const { can } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const items = PRIMARY
    .map((k) => ALL_ITEMS.find((i) => i.key === k))
    .filter((i) => i && can(i.module))
    .slice(0, 4);

  const tab = (item) => {
    const Icon = item.icon;
    const active = item.path === "/admin" ? location.pathname === "/admin" : location.pathname === item.path;
    return (
      <NavLink
        key={item.key}
        to={item.path}
        data-testid={`tab-${item.key}`}
        className={cn(
          "flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon className={cn("h-5 w-5", active && "text-primary")} />
        <span className="truncate max-w-[68px]">{SHORT[item.key] || item.label.split(" ")[0]}</span>
      </NavLink>
    );
  };

  return (
    <nav
      data-testid="mobile-tabbar"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-card/95 backdrop-blur border-t border-border flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map(tab)}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            data-testid="tab-more"
            className="flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72">
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </nav>
  );
}
