import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmassLogo } from "@/components/AmassLogo";
import { toast } from "sonner";

export function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ full_name: "", email: "", password: "", phone: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await signUp(data);
      toast.success(`Welcome, ${u.full_name.split(" ")[0]}! Your AMASS account is ready.`);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const on = (k) => (e) => setData((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-md px-6 py-20" data-testid="register-page">
      <div className="text-center mb-10">
        <AmassLogo className="justify-center" />
        <h1 className="mt-6 font-display text-4xl">Create your account</h1>
        <p className="mt-2 text-neutral-500">One account. Landing, app, admin, marketplace.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 bg-white rounded-2xl border border-neutral-200 p-8 amass-shadow-card">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" required value={data.full_name} onChange={on("full_name")} className="mt-1.5 h-11 rounded-xl" data-testid="register-name" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={data.email} onChange={on("email")} className="mt-1.5 h-11 rounded-xl" data-testid="register-email" />
        </div>
        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" value={data.phone} onChange={on("phone")} className="mt-1.5 h-11 rounded-xl" data-testid="register-phone" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={6} value={data.password} onChange={on("password")} className="mt-1.5 h-11 rounded-xl" data-testid="register-password" />
          <p className="text-xs text-neutral-500 mt-1">Minimum 6 characters.</p>
        </div>
        <Button type="submit" disabled={busy} className="w-full amass-btn-red h-11 rounded-xl" data-testid="register-submit">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link to="/login" className="text-[color:var(--amass-red)] font-semibold" data-testid="register-to-login">Sign in</Link>
      </div>
    </div>
  );
}
