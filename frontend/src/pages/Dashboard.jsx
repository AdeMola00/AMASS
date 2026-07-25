import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Inbox, TrendingUp, UserCog, Users, Building2, Clock4, Mail, ArrowUpRight,
  LayoutTemplate, ShieldCheck, Plus,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const STAT_META = [
  { key: "total_leads", label: "Total Leads", icon: Inbox, accent: "primary" },
  { key: "new_leads_today", label: "New Leads Today", icon: TrendingUp, accent: "gold" },
  { key: "registered_agents", label: "Registered Agents", icon: UserCog, accent: "primary" },
  { key: "registered_users", label: "Registered Users", icon: Users, accent: "primary" },
  { key: "total_properties", label: "Total Properties", icon: Building2, accent: "primary" },
  { key: "pending_property_approvals", label: "Pending Approvals", icon: Clock4, accent: "gold" },
  { key: "newsletter_subscribers", label: "Newsletter Subscribers", icon: Mail, accent: "primary" },
];

const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "#94a3b8", "#64748b"];

function StatCard({ meta, value, index }) {
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
    >
      <Card className="p-5 border-border hover:-translate-y-1 hover:shadow-md transition-transform duration-200" data-testid={`stat-${meta.key}`}>
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{meta.label}</span>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${meta.accent === "gold" ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]" : "bg-primary/10 text-primary"}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 font-heading text-3xl font-extrabold tracking-tight">{value?.toLocaleString?.() ?? "—"}</div>
      </Card>
    </motion.div>
  );
}

function QuickActions() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const actions = [
    { label: "View Leads", icon: Inbox, path: "/admin/leads", module: "leads" },
    { label: "Edit Landing Page", icon: LayoutTemplate, path: "/admin/cms", module: "cms" },
    { label: "Manage Roles", icon: ShieldCheck, path: "/admin/roles", module: "roles" },
    { label: "Add Team Member", icon: Plus, path: "/admin/settings", module: "settings" },
  ].filter((a) => can(a.module));
  return (
    <Card className="p-5">
      <h3 className="font-heading font-semibold text-sm mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate(a.path)}
            data-testid={`quick-action-${a.module}`}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-3 text-sm font-medium hover:border-primary hover:bg-accent transition-colors text-left"
          >
            <a.icon className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{a.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [sources, setSources] = useState([]);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, t, src, a] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/dashboard/leads-trend"),
        api.get("/dashboard/lead-sources"),
        api.get("/dashboard/activities"),
      ]);
      setStats(s.data); setTrend(t.data); setSources(src.data); setActivities(a.data);
    })().catch(() => {});
  }, []);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">
          Welcome back, {user?.name?.split(" ")[0] || "Admin"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Here is what's happening across AMASS today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {STAT_META.map((m, i) =>
          stats ? <StatCard key={m.key} meta={m} value={stats[m.key]} index={i} />
                : <Skeleton key={m.key} className="h-28 rounded-xl" />)}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-sm">Leads — last 14 days</h3>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: -20, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, color: "hsl(var(--foreground))" }} />
                <Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#leadFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Lead Sources</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {sources.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, color: "hsl(var(--foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Activity + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-heading font-semibold text-sm mb-4">Recent Activities</h3>
          <div className="space-y-1" data-testid="recent-activities">
            {activities.length === 0 && <p className="text-sm text-muted-foreground py-4">No recent activity.</p>}
            {activities.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                  {(a.user_name || "S").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate"><span className="font-medium">{a.user_name}</span> {a.action}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
        </Card>
        <QuickActions />
      </div>
    </div>
  );
}
