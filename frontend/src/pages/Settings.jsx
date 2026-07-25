import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ROLE_LABELS } from "@/config/roles";
import { Loader2, Save, UserPlus, Trash2, User, KeyRound } from "lucide-react";

function ProfileCard() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await api.patch("/auth/profile", { name }); await refresh(); toast.success("Profile updated"); }
    catch { toast.error("Update failed"); } finally { setSaving(false); }
  };
  return (
    <Card className="p-6 max-w-xl">
      <h2 className="font-heading text-lg font-bold tracking-tight mb-4">Profile</h2>
      <div className="flex items-center gap-4 mb-5">
        <Avatar className="h-14 w-14"><AvatarFallback className="bg-primary text-primary-foreground font-semibold">{(user?.name||"A").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
        <div>
          <div className="font-medium">{user?.email}</div>
          <Badge variant="outline" className="mt-1">{ROLE_LABELS[user?.role] || user?.role}</Badge>
        </div>
      </div>
      <div className="space-y-2 max-w-sm">
        <Label>Full Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name-input" />
      </div>
      <Button className="mt-4" onClick={save} disabled={saving} data-testid="profile-save">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save
      </Button>
    </Card>
  );
}

function SecurityCard() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: next });
      toast.success("Password changed"); setCur(""); setNext("");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setSaving(false); }
  };
  return (
    <Card className="p-6 max-w-xl">
      <h2 className="font-heading text-lg font-bold tracking-tight mb-4 flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change Password</h2>
      <div className="space-y-4 max-w-sm">
        <div className="space-y-2"><Label>Current Password</Label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="current-password" /></div>
        <div className="space-y-2"><Label>New Password</Label><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="new-password" /></div>
      </div>
      <Button className="mt-4" onClick={save} disabled={saving || !cur || !next} data-testid="change-password-save">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Update Password
      </Button>
    </Card>
  );
}

function TeamCard() {
  const { can, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "customer_support" });
  const [busy, setBusy] = useState(false);
  const canCreate = can("settings", "create");
  const canDelete = can("settings", "delete");

  const load = async () => { const { data } = await api.get("/admin-users"); setMembers(data); };
  useEffect(() => { load().catch(() => {}); }, []);

  const create = async () => {
    setBusy(true);
    try {
      await api.post("/admin-users", form);
      toast.success("Team member added"); setOpen(false);
      setForm({ name: "", email: "", password: "", role: "customer_support" }); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const remove = async (id) => { await api.delete(`/admin-users/${id}`); toast.success("Removed"); load(); };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-heading text-lg font-bold tracking-tight">Team Members</h2>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-member-button"><UserPlus className="h-4 w-4 mr-2" /> Add Member</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-heading">Add Team Member</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="member-name" /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="member-email" /></div>
                <div className="space-y-2"><Label>Temporary Password</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="member-password" /></div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger data-testid="member-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).filter(([k]) => k !== "super_admin").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} disabled={busy || !form.name || !form.email || form.password.length < 6} data-testid="member-create">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0" data-testid={`member-${m.id}`}>
            <Avatar className="h-9 w-9"><AvatarFallback className="bg-muted text-xs font-semibold">{(m.name||"A").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{m.name}</div>
              <div className="text-xs text-muted-foreground truncate">{m.email}</div>
            </div>
            <Badge variant="outline">{ROLE_LABELS[m.role] || m.role}</Badge>
            {canDelete && m.role !== "super_admin" && m.email !== user?.email && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive" data-testid={`member-delete-${m.id}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Remove {m.name}?</AlertDialogTitle><AlertDialogDescription>They will lose access to the admin portal.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(m.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Settings() {
  const { can } = useAuth();
  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account, security and team.</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="settings-tab-profile"><User className="h-4 w-4 mr-1.5" /> Profile</TabsTrigger>
          <TabsTrigger value="security" data-testid="settings-tab-security"><KeyRound className="h-4 w-4 mr-1.5" /> Security</TabsTrigger>
          {can("settings") && <TabsTrigger value="team" data-testid="settings-tab-team"><UserPlus className="h-4 w-4 mr-1.5" /> Team</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile" className="mt-4"><ProfileCard /></TabsContent>
        <TabsContent value="security" className="mt-4"><SecurityCard /></TabsContent>
        <TabsContent value="team" className="mt-4"><TeamCard /></TabsContent>
      </Tabs>
    </div>
  );
}
