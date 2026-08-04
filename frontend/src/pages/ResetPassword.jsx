import React, { useState, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmassLogo } from "@/components/AmassLogo";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export function ResetPassword() {
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const missingToken = useMemo(() => !token, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetPassword(token, password);
      setToken(res.access_token);
      await refresh();
      toast.success("Password updated. You're signed in.");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-20" data-testid="reset-page">
      <div className="text-center mb-10">
        <AmassLogo className="justify-center" />
        <h1 className="mt-6 font-display text-4xl">Choose a new password</h1>
        <p className="mt-2 text-neutral-500">Make it strong. Minimum 6 characters.</p>
      </div>

      {missingToken ? (
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 amass-shadow-card text-center" data-testid="reset-invalid">
          <div className="w-14 h-14 rounded-full bg-red-50 text-[color:var(--amass-red)] flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-xl font-semibold">Invalid or expired link</h2>
          <p className="mt-2 text-neutral-600">This password reset link is missing or has expired.</p>
          <Link to="/forgot-password">
            <Button className="mt-6 amass-btn-red rounded-full">Request a new link</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 bg-white rounded-2xl border border-neutral-200 p-8 amass-shadow-card">
          <div>
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11 rounded-xl" data-testid="reset-password" />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 h-11 rounded-xl" data-testid="reset-confirm" />
          </div>
          <Button type="submit" disabled={busy} className="w-full amass-btn-red h-11 rounded-xl" data-testid="reset-submit">
            {busy ? "Updating…" : "Update password & sign in"}
          </Button>
        </form>
      )}
    </div>
  );
}
