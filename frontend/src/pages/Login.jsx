import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmassLogo } from "@/components/AmassLogo";
import { toast } from "sonner";

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await signIn(email, password);
      toast.success(`Welcome back, ${u.full_name.split(" ")[0]}`);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-20" data-testid="login-page">
      <div className="text-center mb-10">
        <AmassLogo className="justify-center" />
        <h1 className="mt-6 font-display text-4xl">Welcome back</h1>
        <p className="mt-2 text-neutral-500">Sign in to your unified AMASS account.</p>
      </div>

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
            data-testid="login-email"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-11 rounded-xl"
            data-testid="login-password"
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full amass-btn-primary h-11 rounded-xl" data-testid="login-submit">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <div className="text-center text-sm">
          <Link to="/forgot-password" className="text-neutral-600 hover:text-[color:var(--amass-red)]" data-testid="login-forgot-link">
            Forgot your password?
          </Link>
        </div>
      </form>

      <div className="mt-6 text-center text-sm text-neutral-500">
        New to AMASS?{" "}
        <Link to="/register" className="text-[color:var(--amass-red)] font-semibold" data-testid="login-to-register">
          Create an account
        </Link>
      </div>
    </div>
  );
}
