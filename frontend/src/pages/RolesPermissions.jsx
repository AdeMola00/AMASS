import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cloneDeep } from "lodash";
import { MODULE_LABELS } from "@/config/roles";
import { Loader2, Save, ShieldCheck, Lock } from "lucide-react";

export default function RolesPermissions() {
  const { can } = useAuth();
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [actions, setActions] = useState([]);
  const [active, setActive] = useState("");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canEdit = can("roles", "edit");

  const load = async () => {
    const { data } = await api.get("/roles");
    setRoles(data.roles); setModules(data.modules); setActions(data.actions);
    if (!active && data.roles.length) {
      const first = data.roles.find((r) => r.name !== "super_admin") || data.roles[0];
      setActive(first.name); setDraft(cloneDeep(first.permissions));
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const selectRole = (r) => { setActive(r.name); setDraft(cloneDeep(r.permissions)); };

  const toggle = (module, action) => {
    if (!canEdit) return;
    setDraft((prev) => {
      const next = cloneDeep(prev);
      next[module] = next[module] || {};
      next[module][action] = !next[module][action];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/roles/${active}`, { permissions: draft });
      toast.success("Permissions updated");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const activeRole = roles.find((r) => r.name === active);
  const isSuper = active === "super_admin";

  return (
    <div className="space-y-6" data-testid="roles-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Roles & Permissions</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure module-level access for each role (RBAC).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="p-2 lg:col-span-1 h-fit">
          {roles.map((r) => (
            <button
              key={r.name}
              onClick={() => selectRole(r)}
              data-testid={`role-item-${r.name}`}
              className={`w-full text-left rounded-lg px-3 py-2.5 mb-0.5 transition-colors ${active === r.name ? "bg-accent" : "hover:bg-muted"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm flex items-center gap-1.5">
                  <ShieldCheck className={`h-3.5 w-3.5 ${active === r.name ? "text-primary" : "text-muted-foreground"}`} />
                  {r.label}
                </span>
                <Badge variant="secondary" className="text-[10px]">{r.user_count}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.description}</p>
            </button>
          ))}
        </Card>

        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
            <div>
              <h2 className="font-heading text-lg font-bold tracking-tight">{activeRole?.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{activeRole?.description}</p>
            </div>
            {isSuper && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Full Access</Badge>}
          </div>

          {isSuper ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Super Admin always has unrestricted access to every module. This role cannot be modified.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto amass-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted-foreground py-2 pr-4">Module</th>
                      {actions.map((a) => (
                        <th key={a} className="text-center font-medium text-muted-foreground py-2 px-3 capitalize w-20">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((m) => (
                      <tr key={m} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 font-medium">{MODULE_LABELS[m] || m}</td>
                        {actions.map((a) => (
                          <td key={a} className="text-center px-3">
                            <Checkbox
                              checked={!!draft?.[m]?.[a]}
                              onCheckedChange={() => toggle(m, a)}
                              disabled={!canEdit}
                              data-testid={`perm-${m}-${a}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && (
                <div className="mt-6 pt-4 border-t border-border flex justify-end">
                  <Button onClick={save} disabled={saving} data-testid="roles-save">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save Permissions
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
