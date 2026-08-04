import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmassLogo } from "@/components/AmassLogo";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.forgotPassword(email);
      setDone(true);
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-20" data-testid="forgot-page">
      <div className="text-center mb-10">
        <AmassLogo className="justify-center" />
        <h1 className="mt-6 font-display text-4xl">Forgot your password?</h1>
        <p className="mt-2 text-neutral-500">Enter your email and we'll send you a reset link.</p>
      </div>

      {done ? (
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 amass-shadow-card text-center" data-testid="forgot-success">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-xl font-semibold">Check your inbox</h2>
          <p className="mt-2 text-neutral-600">
            If an AMASS account exists for <span className="font-semibold">{email}</span>, a reset link is on its way. The link expires in 30 minutes.
          </p>
          <Link to="/login">
            <Button className="mt-6 amass-btn-primary rounded-full" data-testid="back-to-login">
              Back to sign in
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 bg-white rounded-2xl border border-neutral-200 p-8 amass-shadow-card">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-11 rounded-xl"
              data-testid="forgot-email"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full amass-btn-red h-11 rounded-xl" data-testid="forgot-submit">
            {busy ? "Sending…" : "Send reset link"}
          </Button>
          <div className="text-center text-sm text-neutral-500 pt-2">
            <Link to="/login" className="text-[color:var(--amass-red)] font-semibold">Back to sign in</Link>
          </div>
        </form>
      )}
    </div>
  );
}
