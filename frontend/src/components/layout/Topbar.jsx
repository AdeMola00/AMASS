import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  Menu, Search, Bell, Sun, Moon, LogOut, User, Settings as SettingsIcon, ChevronRight,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarContent } from "./Sidebar";
import { useAuth } from "@/context/AuthContext";
import { ALL_ITEMS, findNavItem } from "@/config/nav";
import api from "@/lib/api";
import { ROLE_LABELS } from "@/config/roles";

function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();
  const item = findNavItem(location.pathname);
  return (
    <div className="hidden md:flex items-center gap-1.5 text-sm" data-testid="breadcrumbs">
      <button onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground transition-colors">
        AMASS
      </button>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium text-foreground">{item?.label || "Dashboard"}</span>
    </div>
  );
}

function MobileTitle() {
  const location = useLocation();
  const item = findNavItem(location.pathname);
  return (
    <div className="md:hidden flex-1 min-w-0" data-testid="mobile-page-title">
      <span className="font-heading font-semibold text-sm truncate block">{item?.label || "Dashboard"}</span>
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = q
    ? ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];
  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="global-search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            placeholder="Search modules..."
            className="pl-9 h-9 bg-muted/50 border-transparent focus-visible:border-border"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        {results.map((r) => (
          <button
            key={r.key}
            onClick={() => { navigate(r.path); setOpen(false); setQ(""); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted text-left"
          >
            <r.icon className="h-4 w-4 text-muted-foreground" />
            {r.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Notifications() {
  const [items, setItems] = useState([]);
  const load = async () => {
    try {
      const { data } = await api.get("/dashboard/activities");
      setItems(data);
    } catch { setItems([]); }
  };
  return (
    <Popover onOpenChange={(o) => o && load()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notifications-button">
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border font-heading font-semibold text-sm">Notifications</div>
        <div className="max-h-80 overflow-y-auto amass-scroll">
          {items.length === 0 && <div className="px-4 py-6 text-sm text-muted-foreground">No recent activity.</div>}
          {items.map((a) => (
            <div key={a.id} className="px-4 py-2.5 border-b border-border/60 last:border-0">
              <div className="text-sm"><span className="font-medium">{a.user_name}</span> {a.action}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Topbar() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = (user?.name || "A").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-16 bg-card/95 backdrop-blur border-b border-border flex items-center gap-3 px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-button">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <Breadcrumbs />
      <MobileTitle />
      <div className="hidden md:flex flex-1 justify-center lg:justify-start lg:pl-6">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon" data-testid="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4.5 w-4.5 hidden dark:block" />
          <Moon className="h-4.5 w-4.5 dark:hidden" />
        </Button>
        <Notifications />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full hover:bg-muted transition-colors" data-testid="profile-menu-button">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-semibold">{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              <span className="mt-1 text-[10px] uppercase tracking-wide text-primary font-semibold">
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/admin/settings")} data-testid="menu-settings">
              <SettingsIcon className="h-4 w-4 mr-2" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/admin/settings")}>
              <User className="h-4 w-4 mr-2" /> Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive" data-testid="logout-button">
              <LogOut className="h-4 w-4 mr-2" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
