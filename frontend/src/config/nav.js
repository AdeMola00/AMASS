import {
  LayoutDashboard, Inbox, LayoutTemplate, Building2, UserCog, Users, KeyRound,
  Hammer, Store, MessageSquare, Bell, BarChart3, FileText, ShieldCheck,
  Settings, Sparkles, Wallet, CreditCard, Repeat, BadgeCheck, Briefcase,
  ShoppingBag, SlidersHorizontal, Coins, Image,
} from "lucide-react";

// module keys MUST match backend MODULES
export const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", path: "/admin", icon: LayoutDashboard, module: "dashboard", built: true },
    ],
  },
  {
    label: "Growth",
    items: [
      { key: "leads", label: "Lead Management", path: "/admin/leads", icon: Inbox, module: "leads", built: true },
      { key: "cms", label: "Landing Page CMS", path: "/admin/cms", icon: LayoutTemplate, module: "cms", built: true },
      { key: "analytics", label: "Analytics", path: "/admin/analytics", icon: BarChart3, module: "analytics" },
      { key: "reports", label: "Reports", path: "/admin/reports", icon: FileText, module: "reports" },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { key: "properties", label: "Properties", path: "/admin/properties", icon: Building2, module: "properties" },
      { key: "property_verification", label: "Property Verification", path: "/admin/property-verification", icon: BadgeCheck, module: "property_verification" },
      { key: "agents", label: "Agents", path: "/admin/agents", icon: UserCog, module: "agents" },
      { key: "users", label: "Users", path: "/admin/users", icon: Users, module: "users" },
      { key: "property_owners", label: "Property Owners", path: "/admin/property-owners", icon: KeyRound, module: "property_owners" },
      { key: "developers", label: "Developers", path: "/admin/developers", icon: Briefcase, module: "developers" },
      { key: "construction_marketplace", label: "Construction Marketplace", path: "/admin/construction", icon: Hammer, module: "construction_marketplace" },
      { key: "home_marketplace", label: "Home Marketplace", path: "/admin/home-marketplace", icon: Store, module: "home_marketplace" },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "marketplace", label: "Marketplace", path: "/admin/marketplace", icon: ShoppingBag, module: "marketplace", built: true },
      { key: "app_config", label: "App Configuration", path: "/admin/app-config", icon: SlidersHorizontal, module: "app_config", built: true },
      { key: "tokens", label: "Token Economy", path: "/admin/tokens", icon: Coins, module: "tokens", built: true },
      { key: "media", label: "Media Library", path: "/admin/media", icon: Image, module: "media", built: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { key: "transactions", label: "Transactions", path: "/admin/transactions", icon: Wallet, module: "transactions" },
      { key: "payments", label: "Payments", path: "/admin/payments", icon: CreditCard, module: "payments" },
      { key: "subscriptions", label: "Subscriptions", path: "/admin/subscriptions", icon: Repeat, module: "subscriptions" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { key: "messages", label: "Messages", path: "/admin/messages", icon: MessageSquare, module: "messages" },
      { key: "notifications", label: "Notifications", path: "/admin/notifications", icon: Bell, module: "notifications" },
    ],
  },
  {
    label: "System",
    items: [
      { key: "roles", label: "Roles & Permissions", path: "/admin/roles", icon: ShieldCheck, module: "roles", built: true },
      { key: "ai_management", label: "AI Management", path: "/admin/ai", icon: Sparkles, module: "ai_management" },
      { key: "settings", label: "Settings", path: "/admin/settings", icon: Settings, module: "settings", built: true },
    ],
  },
];

export const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
export const findNavItem = (path) => ALL_ITEMS.find((i) => i.path === path);
