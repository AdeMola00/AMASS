import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BadgeCheck, ShieldCheck, ShieldOff, CheckCircle2, XCircle } from "lucide-react";

function money(p, c) {
  if (!p) return "—";
  if (p >= 1000000) return `${c === "NGN" ? "₦" : ""}${(p / 1000000).toLocaleString()}M`;
  return `${c === "NGN" ? "₦" : ""}${p.toLocaleString()}`;
}

export default function PropertyVerification() {
  const { can } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("queue"); // queue = pending or unverified
  const canVerify = can("property_verification", "edit");
  const canApprove = can("properties", "edit");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/properties");
      setRows(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => tab === "queue" ? (!r.verified || r.status === "pending") : r.verified);

  const verify = async (r, v) => {
    await api.patch(`/properties/${r.id}/verify`, { verified: v });
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, verified: v } : x)));
    toast.success(v ? "Verified" : "Verification removed");
  };
  const approve = async (r, status) => {
    await api.patch(`/properties/${r.id}/status`, { status });
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, status } : x)));
    toast.success(`Marked ${status}`);
  };

  const pendingCount = rows.filter((r) => !r.verified || r.status === "pending").length;

  return (
    <div className="space-y-6" data-testid="property-verification-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Property Verification</h1>
        <p className="text-muted-foreground text-sm mt-1">Review documents, verify and approve listings before they go live.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue" data-testid="verify-tab-queue">Verification Queue {pendingCount > 0 && <Badge variant="secondary" className="ml-1.5">{pendingCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="verified" data-testid="verify-tab-verified">Verified</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto amass-scroll">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Property</TableHead>
              <TableHead className="hidden md:table-cell">City</TableHead>
              <TableHead className="hidden lg:table-cell">Agent</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Verification</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground"><BadgeCheck className="h-8 w-8 mx-auto mb-2 opacity-40" /> Nothing here — the queue is clear.</TableCell></TableRow>}
              {!loading && filtered.map((r) => (
                <TableRow key={r.id} data-testid={`verify-row-${r.id}`} className="hover:bg-muted/40">
                  <TableCell><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.type} · {r.listing}</div></TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{r.city}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{r.agent_name || "—"}</TableCell>
                  <TableCell className="font-medium">{money(r.price, r.currency)}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {r.status === "pending" && canApprove && (
                        <>
                          <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => approve(r, "approved")} data-testid={`verify-approve-${r.id}`}><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => approve(r, "rejected")} data-testid={`verify-reject-${r.id}`}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
                        </>
                      )}
                      {canVerify && (r.verified
                        ? <Button size="sm" variant="ghost" onClick={() => verify(r, false)} data-testid={`verify-remove-${r.id}`}><ShieldOff className="h-4 w-4 mr-1" /> Unverify</Button>
                        : <Button size="sm" variant="outline" onClick={() => verify(r, true)} data-testid={`verify-mark-${r.id}`}><ShieldCheck className="h-4 w-4 mr-1 text-primary" /> Verify</Button>)}
                    </div>
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
