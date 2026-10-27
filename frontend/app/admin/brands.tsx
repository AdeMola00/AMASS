/**
 * Admin — Brands (Market → Brands is brands-only). Only AMASS admins create a brand and invite its brand managers;
 * each manager gets an email with a single-use “Set my password” link and signs in on the Brand portal (/brand).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { api, ApiError, type AdminBrand, type BrandAccount, type BrandInviteResult } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, StatTile, Toggle, useToast } from "@/src/ui";

type Category = { key: string; label: string; icon: string; color: string };
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function errMsg(e: any, fallback: string) {
  return e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? fallback;
}

function ago(iso?: string | null) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function AdminBrandsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<AdminBrand[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<AdminBrand | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminBrands();
      setItems(r.items);
      setCategories(r.categories);
      setSelected((cur) => (cur ? r.items.find((b) => b.id === cur.id) ?? null : null));
    } catch (e: any) {
      toast.error("Couldn't load brands", errMsg(e, "Please try again."));
      setItems((c) => c ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.is_admin) load();
  }, [user, load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((b) => !q || b.name.toLowerCase().includes(q) || (b.accounts ?? []).some((a) => a.email.includes(q)));
  }, [items, search]);

  if (!user?.is_admin) {
    return (
      <Screen testID="admin-brands-denied">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Brands" />
        <EmptyState variant="error" title="Admin only" body="This area is for AMASS Admin." />
      </Screen>
    );
  }

  const live = (items ?? []).filter((b) => b.published);
  const logins = (items ?? []).reduce((s, b) => s + (b.accounts?.length ?? 0), 0);
  const pending = (items ?? []).reduce((s, b) => s + (b.accounts ?? []).filter((a) => !a.password_set).length, 0);

  return (
    <Screen testID="admin-brands-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Brands" subtitle="Market → Brands · brand logins" right={<Button label="New brand" size="sm" variant="primary" iconLeft="add" onPress={() => setCreateOpen(true)} testID="admin-brand-new" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.stats}>
          <StatTile icon="storefront" tone="brand" value={live.length} label="Live brands" />
          <StatTile icon="key" tone="default" value={logins} label="Brand logins" />
          <StatTile icon="mail-unread" tone={pending ? "warning" : "default"} value={pending} label="Invites pending" />
        </View>
        <Input value={search} onChangeText={setSearch} placeholder="Search brands or login emails" iconLeft="search" autoCapitalize="none" autoCorrect={false} testID="admin-brands-search" />

        {!items ? (
          <SkeletonRows rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState icon="storefront-outline" title={search ? "No brands match" : "No brands yet"} body={search ? "Try another name or email." : "Create a brand, then invite its manager by email. They set their own password and add products from the Brand portal."} actionLabel={search ? undefined : "New brand"} onAction={search ? undefined : () => setCreateOpen(true)} testID="admin-brands-empty" />
        ) : (
          visible.map((b) => {
            const waiting = (b.accounts ?? []).filter((a) => !a.password_set).length;
            return (
              <Card key={b.id} onPress={() => setSelected(b)} elevation="xs" testID={`admin-brand-${b.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={[styles.logo, { backgroundColor: colors.surfaceAlt }]}>
                    {b.logo_url ? <Image source={{ uri: b.logo_url }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <Ionicons name="storefront" size={20} color={colors.textSecondary} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {b.name}
                      </AppText>
                      {!b.published ? <Badge label="Hidden" tone="neutral" size="xs" /> : null}
                      {b.sponsored ? <Badge label="Sponsored" tone="brand" size="xs" /> : null}
                    </View>
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      {b.product_count} product{b.product_count === 1 ? "" : "s"} · {b.accounts?.length ?? 0} login{(b.accounts?.length ?? 0) === 1 ? "" : "s"}
                      {waiting ? ` · ${waiting} awaiting set-up` : ""}
                      {!b.managed ? " · seeded catalogue" : ""}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      <CreateBrandSheet visible={createOpen} onClose={() => setCreateOpen(false)} categories={categories} onCreated={(b) => { setCreateOpen(false); load(); setSelected(b); }} />
      <BrandDetailSheet brand={selected} categories={categories} onClose={() => setSelected(null)} onChanged={load} />
    </Screen>
  );
}

function CreateBrandSheet({ visible, onClose, categories, onCreated }: { visible: boolean; onClose: () => void; categories: Category[]; onCreated: (b: AdminBrand) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [website, setWebsite] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName("");
    setTagline("");
    setCats([]);
    setWebsite("");
    setWhatsapp("");
    setEmail("");
  }, [visible]);

  const create = async () => {
    if (name.trim().length < 2) return toast.error("Give the brand a name");
    if (email.trim() && !EMAIL_RX.test(email.trim())) return toast.error("Check the public email");
    setBusy(true);
    try {
      const b = await api.adminCreateBrand({ name: name.trim(), tagline: tagline.trim() || undefined, categories: cats, website: website.trim() || undefined, whatsapp: whatsapp.trim() || undefined, email: email.trim() || undefined });
      toast.success(`${b.name} created`, "Now invite the brand's manager so they can add products.");
      onCreated(b);
    } catch (e: any) {
      toast.error("Couldn't create the brand", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={() => (busy ? null : onClose())} title="New brand" testID="admin-brand-create-sheet">
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space[4], paddingBottom: 8 }}>
        <Input label="Brand name" value={name} onChangeText={setName} placeholder="e.g. Lumen Lighting" testID="admin-brand-name" />
        <Input label="Tagline (optional)" value={tagline} onChangeText={setTagline} placeholder="Designer lighting, Lagos-delivered" testID="admin-brand-tagline" />
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="secondary">
            Market categories
          </AppText>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Chip key={c.key} label={c.label} selected={cats.includes(c.key)} onPress={() => setCats((cur) => (cur.includes(c.key) ? cur.filter((k) => k !== c.key) : [...cur, c.key]))} testID={`admin-brand-cat-${c.key}`} />
            ))}
          </View>
        </View>
        <Input label="Website (optional)" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="https://" testID="admin-brand-website" />
        <Input label="WhatsApp (optional)" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="+234…" testID="admin-brand-whatsapp" />
        <Input label="Public email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="hello@brand.com" helper="Shown to shoppers. Brand logins are invited separately." testID="admin-brand-email" />
        <Button label="Create brand" variant="primary" size="lg" iconLeft="checkmark" onPress={create} loading={busy} testID="admin-brand-create" />
      </ScrollView>
    </Sheet>
  );
}

function BrandDetailSheet({ brand, categories, onClose, onChanged }: { brand: AdminBrand | null; categories: Category[]; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [lastInvite, setLastInvite] = useState<BrandInviteResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editCats, setEditCats] = useState<string[]>([]);
  const [editWebsite, setEditWebsite] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");

  useEffect(() => {
    if (!brand) {
      setInviteOpen(false);
      setEditOpen(false);
      setLastInvite(null);
      setConfirmDelete(null);
    }
  }, [brand]);

  if (!brand) return <Sheet visible={false} onClose={onClose}><View /></Sheet>;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await onChanged();
    } catch (e: any) {
      toast.error(fail, errMsg(e, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (field: "published" | "sponsored") =>
    run(field, () => api.adminPatchBrand(brand.id, { [field]: !brand[field] } as any), field === "published" ? (brand.published ? `${brand.name} hidden from the Market` : `${brand.name} is live`) : brand.sponsored ? "Sponsored badge removed" : "Marked as sponsored", "Couldn't update");

  const invite = async () => {
    if (!EMAIL_RX.test(invEmail.trim())) return toast.error("Enter the manager's email");
    if (invName.trim().length < 1) return toast.error("Enter the manager's name");
    setBusy("invite");
    try {
      const r = await api.adminCreateBrandAccount(brand.id, { name: invName.trim(), email: invEmail.trim().toLowerCase() });
      setLastInvite(r);
      if (r.email_sent) toast.success("Invite sent", `${r.email} received a link to set their password.`);
      else toast.info("Login created — email not delivered", r.email_error ?? "Share the link below instead.");
      setInvName("");
      setInvEmail("");
      if (r.email_sent) setInviteOpen(false);
      await onChanged();
    } catch (e: any) {
      toast.error("Couldn't invite", errMsg(e, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const resend = async (a: BrandAccount) => {
    setBusy(`resend-${a.id}`);
    try {
      const r = await api.adminResendBrandInvite(brand.id, a.id);
      setLastInvite(r);
      if (r.email_sent) toast.success(a.password_set ? "Reset link sent" : "Invite re-sent", `${a.email} has a fresh link (valid 72 h).`);
      else toast.info("Email not delivered", r.email_error ?? "Share the link instead.");
      await onChanged();
    } catch (e: any) {
      toast.error("Couldn't send", errMsg(e, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (link: string) => {
    await Clipboard.setStringAsync(link);
    toast.success("Link copied", "Send it to the brand manager over WhatsApp or chat. It works once.");
  };

  const openEdit = () => {
    setEditName(brand.name);
    setEditTagline(brand.tagline ?? "");
    setEditCats(brand.categories ?? []);
    setEditWebsite(brand.website ?? "");
    setEditWhatsapp(brand.whatsapp ?? "");
    setEditOpen(true);
  };
  const saveEdit = () =>
    run("edit", async () => {
      await api.adminPatchBrand(brand.id, { name: editName.trim(), tagline: editTagline.trim(), categories: editCats, website: editWebsite.trim(), whatsapp: editWhatsapp.trim() });
      setEditOpen(false);
    }, "Brand updated", "Couldn't save");

  return (
    <Sheet visible={!!brand} onClose={() => (busy ? null : onClose())} title={brand.name} testID="admin-brand-sheet">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 620 }} contentContainerStyle={{ gap: space[4], paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.logo, { backgroundColor: colors.surfaceAlt }]}>
            {brand.logo_url ? <Image source={{ uri: brand.logo_url }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <Ionicons name="storefront" size={20} color={colors.textSecondary} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              {brand.tagline || "No tagline yet"}
            </AppText>
            <AppText variant="micro" tone="tertiary" numberOfLines={1}>
              {brand.product_count} products · {brand.in_stock_count} in stock{brand.categories?.length ? ` · ${brand.categories.map((k) => categories.find((c) => c.key === k)?.label ?? k).join(", ")}` : ""}
            </AppText>
          </View>
          <Button label="Edit" size="sm" variant="secondary" iconLeft="create-outline" onPress={openEdit} testID="admin-brand-edit" />
        </View>

        <View style={{ gap: 12 }}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyMedium">Visible in Market → Brands</AppText>
              <AppText variant="caption" tone="secondary">{brand.published ? "Shoppers can see this brand and its products" : "Hidden from shoppers · brand logins still work"}</AppText>
            </View>
            <Toggle label="Visible in Market → Brands" value={brand.published} onChange={() => toggle("published")} disabled={busy === "published"} testID="admin-brand-published" />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyMedium">Sponsored placement</AppText>
              <AppText variant="caption" tone="secondary">Shows a Sponsored badge and ranks first in its categories</AppText>
            </View>
            <Toggle label="Sponsored placement" value={brand.sponsored} onChange={() => toggle("sponsored")} disabled={busy === "sponsored"} testID="admin-brand-sponsored" />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <AppText variant="label" tone="secondary" uppercase>
              Brand logins
            </AppText>
            <Button label="Invite manager" size="sm" variant="primary" iconLeft="mail" onPress={() => setInviteOpen((v) => !v)} testID="admin-brand-invite-toggle" />
          </View>
          {inviteOpen ? (
            <Card tone="soft" testID="admin-brand-invite-form">
              <View style={{ gap: space[3] }}>
                <AppText variant="bodySm" tone="secondary">
                  They’ll get an email with a single-use “Set my password” link (valid 72 h), then sign in at Brand sign in.
                </AppText>
                <Input label="Manager's name" value={invName} onChangeText={setInvName} placeholder="e.g. Tola Adeyemi" testID="admin-brand-invite-name" />
                <Input label="Manager's email" value={invEmail} onChangeText={setInvEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="tola@brand.com" testID="admin-brand-invite-email" />
                <Button label="Send invite" variant="primary" iconLeft="paper-plane" onPress={invite} loading={busy === "invite"} testID="admin-brand-invite-send" />
              </View>
            </Card>
          ) : null}
          {lastInvite && !lastInvite.email_sent && lastInvite.invite_link ? (
            <Card tone="soft" testID="admin-brand-invite-fallback">
              <View style={{ gap: 8 }}>
                <AppText variant="bodySm">
                  The email to {lastInvite.email} couldn’t be delivered{lastInvite.email_error ? ` (${lastInvite.email_error})` : ""}. Share this single-use link instead:
                </AppText>
                <AppText variant="micro" tone="tertiary" numberOfLines={2} selectable>
                  {lastInvite.invite_link}
                </AppText>
                <Button label="Copy link" size="sm" variant="secondary" iconLeft="copy-outline" onPress={() => copyLink(lastInvite.invite_link!)} testID="admin-brand-invite-copy" />
              </View>
            </Card>
          ) : null}
          {(brand.accounts ?? []).length === 0 ? (
            <AppText variant="caption" tone="tertiary">
              No brand logins yet — invite the person who will manage products.
            </AppText>
          ) : (
            (brand.accounts ?? []).map((a) => (
              <Card key={a.id} elevation="xs" testID={`admin-brand-account-${a.id}`}>
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodyMedium" numberOfLines={1}>
                        {a.name || a.email}
                      </AppText>
                      <AppText variant="caption" tone="secondary" numberOfLines={1}>
                        {a.email}
                      </AppText>
                    </View>
                    {a.disabled ? <Badge label="Disabled" tone="neutral" size="xs" /> : a.password_set ? <Badge label="Active" tone="success" size="xs" /> : <Badge label="Invite pending" tone="warning" size="xs" />}
                  </View>
                  <AppText variant="micro" tone="tertiary">
                    {a.password_set ? `Last sign-in ${ago(a.last_login_at) ?? "never"}` : a.invite_error ? `Email failed · ${a.invite_error}` : `Invite sent ${ago(a.invite_sent_at) ?? ""}`}
                  </AppText>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <Button label={a.password_set ? "Send reset link" : "Resend invite"} size="sm" variant="secondary" iconLeft="mail-outline" onPress={() => resend(a)} loading={busy === `resend-${a.id}`} testID={`admin-brand-account-resend-${a.id}`} />
                    <Button label={a.disabled ? "Enable" : "Disable"} size="sm" variant="ghost" iconLeft={a.disabled ? "play" : "pause"} onPress={() => { if (!a.disabled && lastInvite?.id === a.id) setLastInvite(null); run(`toggle-${a.id}`, () => api.adminToggleBrandAccount(brand.id, a.id, !a.disabled), a.disabled ? "Login enabled" : "Login disabled", "Couldn't update"); }} disabled={!!busy} testID={`admin-brand-account-toggle-${a.id}`} />
                    {confirmDelete === a.id ? (
                      <>
                        <Button label="Confirm remove" size="sm" variant="destructive" iconLeft="trash" onPress={() => { setConfirmDelete(null); if (lastInvite?.id === a.id) setLastInvite(null); run(`del-${a.id}`, () => api.adminDeleteBrandAccount(brand.id, a.id), "Login removed", "Couldn't remove"); }} loading={busy === `del-${a.id}`} testID={`admin-brand-account-delete-confirm-${a.id}`} />
                        <Button label="Cancel" size="sm" variant="ghost" onPress={() => setConfirmDelete(null)} disabled={!!busy} testID={`admin-brand-account-delete-cancel-${a.id}`} />
                      </>
                    ) : (
                      <Button label="Remove" size="sm" variant="ghost" iconLeft="trash-outline" onPress={() => setConfirmDelete(a.id)} disabled={!!busy} testID={`admin-brand-account-delete-${a.id}`} />
                    )}
                  </View>
                  {confirmDelete === a.id ? (
                    <AppText variant="micro" tone="tertiary">
                      Removing deletes this login for good; {a.email} can no longer sign in to the Brand portal. Products stay.
                    </AppText>
                  ) : null}
                </View>
              </Card>
            ))
          )}
        </View>

        {editOpen ? (
          <Card tone="soft" testID="admin-brand-edit-form">
            <View style={{ gap: space[3] }}>
              <Input label="Brand name" value={editName} onChangeText={setEditName} testID="admin-brand-edit-name" />
              <Input label="Tagline" value={editTagline} onChangeText={setEditTagline} testID="admin-brand-edit-tagline" />
              <View style={styles.chips}>
                {categories.map((c) => (
                  <Chip key={c.key} label={c.label} selected={editCats.includes(c.key)} onPress={() => setEditCats((cur) => (cur.includes(c.key) ? cur.filter((k) => k !== c.key) : [...cur, c.key]))} testID={`admin-brand-edit-cat-${c.key}`} />
                ))}
              </View>
              <Input label="Website" value={editWebsite} onChangeText={setEditWebsite} autoCapitalize="none" keyboardType="url" testID="admin-brand-edit-website" />
              <Input label="WhatsApp" value={editWhatsapp} onChangeText={setEditWhatsapp} keyboardType="phone-pad" testID="admin-brand-edit-whatsapp" />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Save" variant="primary" iconLeft="checkmark" onPress={saveEdit} loading={busy === "edit"} testID="admin-brand-edit-save" />
                <Button label="Cancel" variant="ghost" onPress={() => setEditOpen(false)} disabled={busy === "edit"} testID="admin-brand-edit-cancel" />
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space[3] },
  logo: { width: 44, height: 44, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
