import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, Users as UsersIcon, Ban, RotateCcw } from "lucide-react";

export default function Users() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const canEdit = can("users", "edit");

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/platform-users", { params: { search } }); setRows(data); }
    finally { setLoading(false); }
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const setStatus = async (id, status) => {
    await api.patch(`/platform-users/${id}/status`, { status });
    setRows((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(status === "suspended" ? "User suspended" : "User reactivated");
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm mt-1">Registered end-users of the AMASS app.</p>
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="user-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email..." className="pl-9" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto amass-scroll">
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">City</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-16 text-muted-foreground"><UsersIcon className="h-8 w-8 mx-auto mb-2 opacity-40" /> No users found.</TableCell></TableRow>}
              {!loading && rows.map((r) => (
                <TableRow key={r.id} data-testid={`user-row-${r.id}`} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9"><AvatarFallback className="bg-muted text-xs font-semibold">{(r.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div className="min-w-0"><div className="font-medium truncate">{r.name}</div><div className="text-xs text-muted-foreground truncate">{r.email}</div></div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.phone || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{r.city || "—"}</TableCell>
                  <TableCell>
                    {r.status === "suspended"
                      ? <Badge variant="outline" className="bg-destructive/12 text-destructive border-destructive/25">Suspended</Badge>
                      : <Badge variant="outline" className="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25">Active</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && (r.status === "suspended"
                      ? <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "active")} data-testid={`user-activate-${r.id}`}><RotateCcw className="h-4 w-4 mr-1.5" /> Reactivate</Button>
                      : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setStatus(r.id, "suspended")} data-testid={`user-suspend-${r.id}`}><Ban className="h-4 w-4 mr-1.5" /> Suspend</Button>)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
