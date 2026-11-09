import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PhotoAdder } from "@/src/photos";
import { useSettings } from "@/src/settings";
import { fonts, space, useTheme } from "@/src/theme";
import { BigButton, LoadingView, ScreenHeader, useToast } from "@/src/ui";
import { BigInput, OptionGrid } from "@/src/Wizard";

export default function ProductEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useSettings();
  const { brand, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [loaded, setLoaded] = useState(!id);
  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [stock, setStock] = useState<"in_stock" | "out_of_stock" | "preorder">("in_stock");
  const [desc, setDesc] = useState("");
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<{ items: any[] }>("/brand/products").then((r) => {
      const p = r.items.find((x) => x.id === id);
      if (p) {
        setPhotos(p.images || []);
        setName(p.name || "");
        setPrice(String(p.price || ""));
        setCat(p.category || null);
        setStock(p.stock_status || "in_stock");
        setDesc(p.description || "");
        setPublished(!!p.published);
      }
      setLoaded(true);
    });
  }, [id]);

  const priceN = parseInt(price.replace(/\D/g, ""), 10) || 0;
  const valid = name.trim().length >= 2 && priceN > 0 && !!cat;

  const save = async () => {
    setBusy("save");
    try {
      const body = { name: name.trim(), price: priceN, category: cat, images: photos, stock_status: stock, description: desc.trim(), published: true };
      if (id) await api(`/brand/products/${id}`, { method: "PATCH", body });
      else await api("/brand/products", { body });
      toast.show(t("saved"));
      refresh();
      router.back();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  const hide = async () => {
    setBusy("hide");
    try {
      await api(`/brand/products/${id}`, { method: "DELETE" });
      toast.show(t("saved"));
      router.back();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(null);
    }
  };

  const L = ({ text }: { text: string }) => <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface }}>{text}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={id ? t("edit") : t("tile_add_product")} guide="guide_detail" back />
      {!loaded ? (
        <LoadingView />
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
          <L text={t("step_photos")} />
          <PhotoAdder photos={photos} onChange={setPhotos} uploadPath="/brand/upload" max={6} />
          <L text={t("product_name")} />
          <BigInput testID="product-name-input" value={name} onChangeText={setName} placeholder={t("product_name")} />
          <L text={t("price")} />
          <BigInput testID="product-price-input" money value={price ? naira(priceN) : ""} onChangeText={setPrice} keyboardType="number-pad" placeholder="₦0" />
          <L text={t("group")} />
          <OptionGrid testPrefix="product-cat" value={cat} onChange={setCat} options={(brand?.categories ?? []).map((c) => ({ key: c.key, label: c.label, icon: c.icon || "cube" }))} />
          <L text={t("stock")} />
          <OptionGrid
            testPrefix="product-stock"
            value={stock}
            onChange={setStock}
            options={[
              { key: "in_stock", label: t("status_in_stock"), icon: "checkmark-circle" },
              { key: "out_of_stock", label: t("status_out_of_stock"), icon: "close-circle" },
              { key: "preorder", label: t("status_preorder"), icon: "time" },
            ]}
          />
          <L text={t("description")} />
          <BigInput testID="product-desc-input" value={desc} onChangeText={setDesc} placeholder={t("description")} multiline style={{ minHeight: 110, paddingTop: 18 }} />
          <BigButton label={!published && id ? t("show_again") : t("save")} icon="checkmark-circle" onPress={save} disabled={!valid} loading={busy === "save"} testID="product-save-button" />
          {id && published ? <BigButton label={t("hide")} icon="eye-off" tone="neutral" outline onPress={hide} loading={busy === "hide"} testID="product-hide-button" /> : null}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}
