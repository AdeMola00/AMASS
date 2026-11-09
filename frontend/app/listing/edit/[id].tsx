import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { absUrl, api, naira } from "@/src/api";
import { PhotoAdder } from "@/src/photos";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, LoadingView, ScreenHeader, tap, useToast } from "@/src/ui";
import { BigInput } from "@/src/Wizard";

const STEPS = [-10, -5, 5, 10];

export default function EditListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useSettings();
  const router = useRouter();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [orig, setOrig] = useState(0);
  const [price, setPrice] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const originals = useRef<Record<string, string>>({});

  useEffect(() => {
    api<any>(`/properties/${id}`)
      .then((p) => {
        setOrig(p.price || 0);
        setPrice(p.price || 0);
        const raw: string[] = ((p.images?.length ? p.images : [p.image]) || []).filter(Boolean);
        // Show full links, but save the original paths back so relative ones keep working after deploy.
        raw.forEach((u) => (originals.current[absUrl(u) as string] = u));
        setPhotos(raw.map((u) => absUrl(u) as string));
      })
      .catch(() => toast.show(t("error_load"), "error"))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const bump = (pct: number) => {
    tap();
    // round to a friendly number (nearest ₦1,000)
    setPrice((p) => Math.max(1000, Math.round((p * (1 + pct / 100)) / 1000) * 1000));
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/partner/listings/${id}`, { method: "PATCH", body: { price, images: photos.map((u) => originals.current[u] ?? u) } });
      toast.show(t("saved"));
      router.back();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };

  const changed = price !== orig;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("edit_listing")} guide="guide_edit" back />
      {!loaded ? (
        <LoadingView />
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Ionicons name="cash" size={24} color={colors.onSurface} />
            <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface }}>{t("price")}</Text>
          </View>
          <BigInput testID="edit-price-input" money value={price ? naira(price) : ""} onChangeText={(v: string) => setPrice(parseInt(v.replace(/\D/g, ""), 10) || 0)} keyboardType="number-pad" placeholder="₦0" />
          {changed ? (
            <Text testID="edit-price-was" style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.muted }}>
              {naira(orig)} → <Text style={{ color: price < orig ? colors.success : colors.brandPrimary }}>{naira(price)}</Text>
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {STEPS.map((pct) => (
              <Pressable
                key={pct}
                testID={`edit-price-${pct > 0 ? "up" : "down"}-${Math.abs(pct)}`}
                onPress={() => bump(pct)}
                style={({ pressed }) => ({ flex: 1, minHeight: 64, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center", gap: 2, borderColor: pct < 0 ? colors.success : colors.brandPrimary, backgroundColor: pct < 0 ? colors.successSoft : colors.brandSecondary, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name={pct < 0 ? "arrow-down" : "arrow-up"} size={22} color={pct < 0 ? colors.success : colors.brandPrimary} />
                <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: pct < 0 ? colors.success : colors.brandPrimary }}>
                  {pct > 0 ? "+" : "−"}
                  {Math.abs(pct)}%
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md }}>
            <Ionicons name="images" size={24} color={colors.onSurface} />
            <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface }}>{t("photos")}</Text>
          </View>
          <PhotoAdder photos={photos} onChange={setPhotos} uploadPath="/partner/upload" max={12} testID="edit-photos" />

          <View style={{ height: space.sm }} />
          <BigButton label={t("save")} icon="checkmark-circle" onPress={save} disabled={!price || !photos.length} loading={busy} testID="edit-save-button" />
          {!photos.length ? <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.brandPrimary, textAlign: "center" }}>{t("photo_needed")}</Text> : null}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}
