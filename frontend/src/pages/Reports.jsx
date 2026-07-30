import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Download, FileText, Inbox, Building2, UserCog, ShoppingBag, Wallet, Users, Coins } from "lucide-react";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "#94a3b8"];
const tip = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, color: "hsl(var(--foreground))" };

const KPIS = [
  { key: "total_leads", label: "Total Leads" }, { key: "total_listings", label: "Listings" },
  { key: "approved_listings", label: "Approved" }, { key: "verified_agents", label: "Verified Agents" },
  { key: "products", label: "Products" }, { key: "est_token_revenue", label: "Est. Token Revenue (₦)" },
];

const EXPORTS = [
  { ds: "leads", label: "Leads", icon: Inbox }, { ds: "properties", label: "Properties", icon: Building2 },
  { ds: "agents", label: "Agents", icon: UserCog }, { ds: "products", label: "Products", icon: ShoppingBag },
  { ds: "wallets", label: "Wallets", icon: Wallet }, { ds: "users", label: "Users", icon: Users },
];

export default function Reports() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/reports/summary").then((r) => setD(r.data)).catch(() => {}); }, []);

  const download = async (ds) => {
    try {
      const res = await api.get("/reports/export", { params: { dataset: ds }, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = `amass_${ds}.csv`; a.click();
      window.URL.revokeObjectURL(url); toast.success(`Exported ${ds}.csv`);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Operational & financial summaries with one-click CSV exports.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KPIS.map((k) => d ? (
          <Card key={k.key} className="p-4" data-testid={`report-kpi-${k.key}`}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-2 font-heading text-xl font-extrabold">{(d.totals[k.key] || 0).toLocaleString()}</div>
          </Card>
        ) : <Skeleton key={k.key} className="h-20 rounded-xl" />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-heading font-semibold text-sm mb-4">Leads vs New Listings — 6 months</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(d?.leads_by_month || []).map((r, i) => ({ month: r.month, leads: r.leads, listings: d.listings_by_month[i]?.listings || 0 }))} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: "hsl(var(--muted))" }} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="listings" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Products by Category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={d?.products_by_category || []} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {(d?.products_by_category || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip contentStyle={tip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-heading font-semibold text-sm mb-4 flex items-center gap-2"><Download className="h-4 w-4 text-primary" /> Data Exports</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {EXPORTS.map((e) => (
            <button key={e.ds} onClick={() => download(e.ds)} data-testid={`export-${e.ds}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:border-primary hover:bg-accent transition-colors">
              <e.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{e.label}</span>
              <span className="text-[10px] text-muted-foreground">CSV</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
