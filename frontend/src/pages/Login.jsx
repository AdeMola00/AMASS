import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (res.ok) navigate("/admin");
    else setError(res.error);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-[#0f1512] text-white overflow-hidden">
        <div
          className="absolute inset-0 opacity-25"
          style={{ backgroundImage: "url(https://images.pexels.com/photos/19219055/pexels-photo-19219055.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1512] via-[#0f1512]/70 to-transparent" />
        <div className="relative flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center font-heading font-extrabold text-lg">A</div>
          <span className="font-heading font-extrabold tracking-tight text-lg">AMASS</span>
        </div>
        <div className="relative">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight leading-tight">
            The operating system for<br /><span className="text-primary">Africa's property</span> ecosystem.
          </h1>
          <p className="mt-4 text-white/70 max-w-md">
            Manage your landing page, leads, agents, properties and the entire AMASS platform from one intelligent dashboard.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-white/60">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--gold))]" /> Secure JWT authentication
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-heading font-extrabold">A</div>
            <span className="font-heading font-extrabold tracking-tight">AMASS Admin</span>
          </div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground text-sm mt-1">Sign in to your admin account to continue.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" required data-testid="login-email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@amass.africa" className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password" type={show ? "text" : "password"} required data-testid="login-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••" className="h-11 pr-10"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <div data-testid="login-error" className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</div>}
            <Button type="submit" disabled={loading} data-testid="login-submit" className="w-full h-11 text-sm font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted-foreground text-center">
            Protected area. Access is restricted to authorized AMASS staff.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
