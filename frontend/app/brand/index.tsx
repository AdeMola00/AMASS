/**
 * Brand portal — a brand-only login (issued by AMASS admin), separate from the member app session.
 * Signed in: the brand's storefront summary, its products (add / edit / hide), profile details and password.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { brandApi, brandToken, type BrandMe, type BrandProduct } from "@/src/lib/brandApi";
import { ProductFormSheet } from "@/src/components/brand/ProductForm";
import { AmassLogo } from "@/src/components/AmassLogo";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Input, ListRow, RowGroup, Screen, ScreenHeader, Sheet, SkeletonRows, StatTile, useToast } from "@/src/ui";

export default function BrandPortalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<BrandMe | null>(null);
  const [products, setProducts] = useState<BrandProduct[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<{ open: boolean; product: BrandProduct | null }>({ open: false, product: null });
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([brandApi.me(), brandApi.products()]);
      setMe(m);
      setProducts(p.items);
    } catch {
      setMe(null);
      setProducts(null);
    } finally {
      setChecking(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    brandToken.get().then((t) => (t ? load() : setChecking(false)));
  }, [load]);

  const signOut = async () => {
    await brandApi.logout();
    setMe(null);
    setProducts(null);
  };

  const hide = async (p: BrandProduct) => {
    try {
      await brandApi.updateProduct(p.id, { published: !p.published });
      toast.success(p.published ? "Hidden from the Market" : "Back on the Market");
      load();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message ?? "Please try again.");
    }
  };

  if (checking) {
    return (
      <Screen testID="brand-loading">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Brand portal" />
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={4} />
        </View>
      </Screen>
    );
  }

  if (!me) return <BrandLogin onSignedIn={load} />;

  const live = (products ?? []).filter((p) => p.published);
  return (
    <Screen testID="brand-portal-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={me.brand.name} subtitle="Brand portal · Market → Brands" right={<Button label="Add product" size="sm" variant="primary" iconLeft="add" onPress={() => setForm({ open: true, product: null })} testID="brand-add-product" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
        <Card elevation="xs" style={{ flexDirection: "row", alignItems: "center", gap: 12 }} testID="brand-card">
          <View style={[styles.logo, { backgroundColor: colors.surfaceAlt }]}>
            {me.brand.logo_url ? <Image source={{ uri: me.brand.logo_url }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <Ionicons name="storefront" size={24} color={colors.textSecondary} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" numberOfLines={1}>
              {me.brand.name}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              {me.brand.tagline || "Add a tagline so shoppers know what you sell."}
            </AppText>
          </View>
          <Badge label={me.brand.published === false ? "Hidden from Market" : "Verified brand"} tone={me.brand.published === false ? "neutral" : "success"} icon={me.brand.published === false ? "eye-off" : "shield-checkmark"} size="xs" />
        </Card>

        <View style={styles.stats}>
          <StatTile icon="cube" tone="brand" value={live.length} label="Live" />
          <StatTile icon="checkmark-circle" tone="default" value={live.filter((p) => p.stock_status === "in_stock").length} label="In stock" />
          <StatTile icon="eye" tone="mass" value={(products ?? []).reduce((s, p) => s + (p.views || 0), 0)} label="Views" />
        </View>

        <View style={{ gap: space[3] }}>
          <AppText variant="label" tone="secondary" uppercase>
            Products
          </AppText>
          {!products ? (
            <SkeletonRows rows={3} />
          ) : products.length === 0 ? (
            <EmptyState icon="cube-outline" title="No products yet" body="Add your first product — name, price, photos — and it appears under Market → Brands for every AMASS member." actionLabel="Add product" onAction={() => setForm({ open: true, product: null })} testID="brand-products-empty" />
          ) : (
            products.map((p) => (
              <Card key={p.id} elevation="xs" testID={`brand-product-${p.id}`}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <Pressable onPress={() => setForm({ open: true, product: p })} accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`} style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 12, alignItems: "center" }} testID={`brand-product-open-${p.id}`}>
                    <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
                      {p.images[0] ? <Image source={{ uri: p.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="image-outline" size={20} color={colors.textTertiary} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <AppText variant="bodyMedium" numberOfLines={1}>
                        {p.name}
                      </AppText>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <AppText variant="caption" tabular>
                          {formatNaira(p.price)}
                        </AppText>
                        <AppText variant="caption" tone="tertiary">
                          · {p.category_name}
                        </AppText>
                        {p.promo ? <Badge label="Deal" tone="brand" size="xs" /> : null}
                        {!p.published ? <Badge label="Hidden" tone="neutral" size="xs" /> : p.stock_status !== "in_stock" ? <Badge label={p.stock_status === "preorder" ? "Pre-order" : "Out of stock"} tone="warning" size="xs" /> : null}
                      </View>
                    </View>
                  </Pressable>
                  <Button label={p.published ? "Hide" : "Show"} size="sm" variant="ghost" onPress={() => hide(p)} testID={`brand-product-toggle-${p.id}`} />
                </View>
              </Card>
            ))
          )}
        </View>

        <RowGroup title="Brand account">
          <ListRow icon="storefront-outline" iconTone="brand" label="Brand profile" caption="Tagline · logo · WhatsApp · website" onPress={() => setProfileOpen(true)} testID="brand-profile-row" />
          <ListRow icon="key-outline" label="Change password" onPress={() => setPwOpen(true)} testID="brand-password-row" />
          <ListRow icon="eye-outline" iconTone="info" label="See your storefront in the Market" caption="How shoppers see your brand" onPress={() => router.push(`/shop/store/${me.brand.slug}` as any)} testID="brand-view-store" />
          <ListRow icon="log-out-outline" label={`Sign out ${me.account.email}`} onPress={signOut} destructive last testID="brand-signout" />
        </RowGroup>
      </ScrollView>

      <ProductFormSheet visible={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} categories={me.categories} product={form.product} onSaved={() => load()} />
      <BrandProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} me={me} onSaved={(m) => setMe(m)} />
      <ChangePasswordSheet visible={pwOpen} onClose={() => setPwOpen(false)} onDone={() => load()} />
    </Screen>
  );
}

function BrandLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await brandApi.login(email.trim(), password);
      toast.success("Welcome back");
      onSignedIn();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    const target = (forgotEmail || email).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return toast.error("Enter the brand login email");
    setForgotBusy(true);
    try {
      const r = await brandApi.forgotPassword(target);
      toast.success("Check your inbox", r.message);
      setForgotOpen(false);
    } catch (e: any) {
      toast.error("Couldn't send the link", e?.message ?? "Please try again.");
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]} testID="brand-login-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Brand sign in" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(auth)/login" as any))} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], gap: space[5] }} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <AmassLogo size="lg" />
          <AppText variant="display">Brand portal</AppText>
          <AppText variant="bodySm" tone="secondary" style={{ textAlign: "center" }}>
            For brands listed under Market → Brands. Sign in with the brand login AMASS issued to you — this is separate from a member account.
          </AppText>
        </View>
        <View style={{ gap: space[4] }}>
          <Input label="Brand email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@yourbrand.com" testID="brand-login-email" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" testID="brand-login-password" error={error ?? undefined} />
          <Button label="Sign in" variant="primary" size="lg" fullWidth onPress={submit} loading={busy} disabled={!email || !password} testID="brand-login-submit" />
          <Button label="Forgot password? Email me a link" variant="ghost" size="sm" onPress={() => { setForgotEmail(email); setForgotOpen(true); }} testID="brand-forgot" />
          <AppText variant="caption" tone="tertiary" style={{ textAlign: "center" }}>
            New here? Your invite email from AMASS has a “Set my password” button — open it on this device to activate your login. Want your brand on AMASS? Email partners@amass.africa.
          </AppText>
        </View>
      </KeyboardAwareScrollView>
      <Sheet visible={forgotOpen} onClose={() => (forgotBusy ? null : setForgotOpen(false))} title="Set a new password" testID="brand-forgot-sheet">
        <View style={{ gap: space[4], paddingBottom: 8 }}>
          <AppText variant="bodySm" tone="secondary">
            We’ll email a single-use link to your brand login address. It also works if you never set a password after your invite.
          </AppText>
          <Input label="Brand email" value={forgotEmail} onChangeText={setForgotEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@yourbrand.com" testID="brand-forgot-email" />
          <Button label="Email me the link" variant="primary" iconLeft="mail" onPress={sendReset} loading={forgotBusy} testID="brand-forgot-send" />
        </View>
      </Sheet>
    </Screen>
  );
}

function BrandProfileSheet({ visible, onClose, me, onSaved }: { visible: boolean; onClose: () => void; me: BrandMe; onSaved: (m: BrandMe) => void }) {
  const toast = useToast();
  const [tagline, setTagline] = useState(me.brand.tagline ?? "");
  const [whatsapp, setWhatsapp] = useState(me.brand.whatsapp ?? "");
  const [website, setWebsite] = useState(me.brand.website ?? "");
  const [logo, setLogo] = useState(me.brand.logo_url ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setTagline(me.brand.tagline ?? "");
    setWhatsapp(me.brand.whatsapp ?? "");
    setWebsite(me.brand.website ?? "");
    setLogo(me.brand.logo_url ?? "");
  }, [visible, me]);
  const save = async () => {
    setBusy(true);
    try {
      const m = await brandApi.updateProfile({ tagline: tagline.trim(), whatsapp: whatsapp.trim(), website: website.trim(), logo_url: logo.trim() });
      onSaved(m);
      toast.success("Brand profile saved");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={() => (busy ? null : onClose())} title="Brand profile" testID="brand-profile-sheet">
      <View style={{ gap: space[4], paddingBottom: 8 }}>
        <Input label="Tagline" value={tagline} onChangeText={setTagline} placeholder="Designer lighting, Lagos-delivered" testID="brand-profile-tagline" />
        <Input label="WhatsApp number" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="+234…" helper="Shoppers tap to chat with you" testID="brand-profile-whatsapp" />
        <Input label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="https://" testID="brand-profile-website" />
        <Input label="Logo image URL" value={logo} onChangeText={setLogo} autoCapitalize="none" placeholder="https://…/logo.png" helper="Square PNG works best" testID="brand-profile-logo" />
        <Button label="Save" variant="primary" iconLeft="checkmark" onPress={save} loading={busy} testID="brand-profile-save" />
      </View>
    </Sheet>
  );
}

function ChangePasswordSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (next.length < 8) return toast.error("Use at least 8 characters");
    setBusy(true);
    try {
      await brandApi.changePassword(current, next);
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      onClose();
      onDone();
    } catch (e: any) {
      toast.error("Couldn't change password", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={() => (busy ? null : onClose())} title="Change password" testID="brand-password-sheet">
      <View style={{ gap: space[4], paddingBottom: 8 }}>
        <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry testID="brand-pw-current" />
        <Input label="New password" value={next} onChangeText={setNext} secureTextEntry helper="At least 8 characters" testID="brand-pw-new" />
        <Button label="Update password" variant="primary" iconLeft="key" onPress={save} loading={busy} disabled={!current || !next} testID="brand-pw-save" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space[3] },
  logo: { width: 52, height: 52, borderRadius: radii.lg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  thumb: { width: 56, height: 56, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
