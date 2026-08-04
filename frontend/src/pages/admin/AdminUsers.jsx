import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Search } from "lucide-react";

export function AdminUsers() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.admin.users({ q: q || undefined, limit: 200 }).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = async (u, field) => {
    try {
      await api.admin.updateUserRole(u.id, { [field]: !u[field] });
      toast.success(`${field} updated`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div data-testid="admin-users">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">Users</div>
        <h1 className="font-display text-4xl">User management</h1>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mt-6 flex gap-2 mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" className="pl-9 h-11 rounded-xl" data-testid="users-search" />
        </div>
        <Button type="submit" className="amass-btn-primary rounded-xl h-11 px-6">Search</Button>
      </form>

      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="text-left px-6 py-3">User</th>
              <th className="text-left px-6 py-3">Joined</th>
              <th className="text-left px-6 py-3">Agent</th>
              <th className="text-left px-6 py-3">Admin</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="4" className="px-6 py-12 text-center text-neutral-500">Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan="4" className="px-6 py-12 text-center text-neutral-500">No users found.</td></tr>}
            {items.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100" data-testid={`admin-user-${u.id}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[color:var(--amass-red)] text-white flex items-center justify-center text-sm font-semibold">
                      {(u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">{u.full_name}</div>
                      <div className="text-xs text-neutral-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-neutral-600">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-6 py-4">
                  <Switch checked={!!u.is_agent} onCheckedChange={() => toggle(u, "is_agent")} data-testid={`toggle-agent-${u.id}`} />
                </td>
                <td className="px-6 py-4">
                  <Switch checked={!!u.is_admin} onCheckedChange={() => toggle(u, "is_admin")} data-testid={`toggle-admin-${u.id}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
