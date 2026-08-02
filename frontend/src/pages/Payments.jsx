import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, CheckCircle2, ExternalLink, Loader2, Coins, Repeat } from "lucide-react";

export default function Payments() {
  const { can } = useAuth();
  const canPay = can("payments", "create");
  const [bundles, setBundles] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ email: "test@amass.africa", purpose: "token_bundle", item_id: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/tokens/bundles").then((r) => setBundles(r.data)).catch(() => {});
    api.get("/tokens/plans").then((r) => setPlans(r.data)).catch(() => {});
  }, []);

  const items = form.purpose === "token_bundle" ? bundles : plans;

  const initialize = async () => {
    if (!form.item_id) return;
    setBusy(true); setResult(null);
    try {
      const { data } = await api.post("/payments/initialize", form);
      setResult(data);
      window.open(data.authorization_url, "_blank");
      toast.success("Checkout opened — complete payment in the new tab");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  const verify = async () => {
    if (!result?.reference) return;
    try { const { data } = await api.get(`/payments/verify/${result.reference}`); toast.success(`Status: ${data.status}`); }
    catch { toast.error("Verify failed"); }
  };

  return (
    <div className="space-y-6" data-testid="payments-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">Paystack gateway for token bundles & subscription plans.</p>
      </div>

      <Card className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><CreditCard className="h-5 w-5" /></div>
          <div><div className="font-heading font-semibold">Paystack</div><div className="text-xs text-muted-foreground">Test mode — NGN</div></div>
        </div>
        <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 gap-1" data-testid="paystack-status"><CheckCircle2 className="h-3.5 w-3.5" /> Connected</Badge>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-6 space-y-4">
          <h3 className="font-heading font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Create a Payment</h3>
          <div className="space-y-1.5"><Label>Customer Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="pay-email" /></div>
          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v, item_id: "" })}>
              <SelectTrigger data-testid="pay-purpose"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="token_bundle"><span className="flex items-center gap-2"><Coins className="h-4 w-4" /> Token Bundle</span></SelectItem>
                <SelectItem value="subscription"><span className="flex items-center gap-2"><Repeat className="h-4 w-4" /> Subscription Plan</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
              <SelectTrigger data-testid="pay-item"><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>{items.filter((i) => i.price > 0).map((i) => <SelectItem key={i.id} value={i.id}>{i.name} — ₦{(i.price || 0).toLocaleString()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={initialize} disabled={busy || !canPay || !form.item_id} className="w-full" data-testid="pay-initialize">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />} Initialize Checkout
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="font-heading font-semibold mb-3">Result</h3>
          {!result ? <p className="text-sm text-muted-foreground">Initialize a payment to get a Paystack checkout link and reference.</p> : (
            <div className="space-y-3 text-sm" data-testid="pay-result">
              <div><span className="text-muted-foreground">Reference:</span> <span className="font-mono">{result.reference}</span></div>
              <div><span className="text-muted-foreground">Amount:</span> ₦{(result.amount || 0).toLocaleString()}</div>
              <a href={result.authorization_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary font-medium"><ExternalLink className="h-4 w-4" /> Open checkout</a>
              <div className="pt-2"><Button variant="outline" size="sm" onClick={verify} data-testid="pay-verify">Verify Payment</Button></div>
              <p className="text-xs text-muted-foreground pt-1">Use Paystack test card <span className="font-mono">4084 0840 8408 4081</span>, any future expiry, CVV 408.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
