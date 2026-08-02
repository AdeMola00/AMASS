import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Loader2, RefreshCw } from "lucide-react";

const ST = { success: "text-emerald-600 border-emerald-500/30", pending: "text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30", failed: "text-destructive border-destructive/25" };

export default function Transactions() {
  const { can } = useAuth();
  const canVerify = can("payments");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ status: "all", purpose: "all" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/transactions", { params: f }); setRows(data); } finally { setLoading(false); }
  }, [f]);
  useEffect(() => { load(); }, [load]);

  const verify = async (ref) => {
    try { const { data } = await api.get(`/payments/verify/${ref}`); toast.success(`Status: ${data.status}`); load(); }
    catch { toast.error("Verify failed"); }
  };

  return (
    <div className="space-y-6" data-testid="transactions-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">All payments processed through the platform (Paystack).</p>
        </div>
        <Button variant="outline" onClick={load} data-testid="txn-refresh"><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-3">
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger className="sm:w-40" data-testid="txn-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="success">Success</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent></Select>
        <Select value={f.purpose} onValueChange={(v) => setF({ ...f, purpose: v })}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Purposes</SelectItem><SelectItem value="token_bundle">Token Bundle</SelectItem><SelectItem value="subscription">Subscription</SelectItem></SelectContent></Select>
      </Card>

      <Card className="overflow-hidden"><div className="overflow-x-auto amass-scroll">
        <Table>
          <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead className="hidden md:table-cell">Email</TableHead><TableHead>Item</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground"><Wallet className="h-8 w-8 mx-auto mb-2 opacity-40" /> No transactions yet.</TableCell></TableRow>}
            {!loading && rows.map((t) => (
              <TableRow key={t.id} data-testid={`txn-row-${t.id}`}>
                <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{t.email}</TableCell>
                <TableCell className="text-sm">{t.item_name}<div className="text-xs text-muted-foreground capitalize">{t.purpose?.replace("_", " ")}</div></TableCell>
                <TableCell className="font-medium">₦{(t.amount || 0).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline" className={`capitalize ${ST[t.status] || ""}`}>{t.status}</Badge></TableCell>
                <TableCell className="text-right">{canVerify && t.status === "pending" && <Button size="sm" variant="ghost" onClick={() => verify(t.reference)} data-testid={`txn-verify-${t.id}`}>Verify</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></Card>
    </div>
  );
}
