import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export function AdminAuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.admin.auditLog(100).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  return (
    <div data-testid="admin-audit-log">
      <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">Audit log</div>
      <h1 className="font-display text-4xl">Admin activity</h1>
      <p className="mt-2 text-neutral-500">Every admin action is recorded here.</p>

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th className="text-left px-6 py-3">When</th>
              <th className="text-left px-6 py-3">Actor</th>
              <th className="text-left px-6 py-3">Action</th>
              <th className="text-left px-6 py-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="4" className="text-center py-12 text-neutral-500">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan="4" className="text-center py-12 text-neutral-500">No admin actions logged yet.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-neutral-100" data-testid={`audit-row-${i}`}>
                <td className="px-6 py-3 text-neutral-600 text-xs">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                </td>
                <td className="px-6 py-3 text-neutral-800">{r.actor_email}</td>
                <td className="px-6 py-3">
                  <Badge variant="outline">{r.action}</Badge>
                </td>
                <td className="px-6 py-3 text-xs font-mono text-neutral-500 truncate max-w-[280px]">{r.target_id || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
