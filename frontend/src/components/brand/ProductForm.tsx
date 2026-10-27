/**
 * Brand portal — product form (new / edit) in a bottom sheet. Brands pick one of the Market categories, set a
 * price in naira, optional "was" price for a deal badge, stock status and up to 4 photos.
 */
import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@react-native-vector-icons/ionicons";
import { brandApi, type BrandCategory, type BrandProduct, type BrandProductInput } from "@/src/lib/brandApi";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Chip, Input, Sheet, useToast } from "@/src/ui";

const MAX_PHOTOS = 4;
const STOCK: { key: "in_stock" | "out_of_stock" | "preorder"; label: string }[] = [
  { key: "in_stock", label: "In stock" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "preorder", label: "Pre-order" },
];

export function ProductFormSheet({ visible, onClose, categories, product, onSaved }: { visible: boolean; onClose: () => void; categories: BrandCategory[]; product: BrandProduct | null; onSaved: (p: BrandProduct) => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0]?.key ?? "home_decor");
  const [price, setPrice] = useState("");
  const [wasPrice, setWasPrice] = useState("");
  const [stock, setStock] = useState<"in_stock" | "out_of_stock" | "preorder">("in_stock");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(product?.name ?? "");
    setDescription(product?.description ?? "");
    setCategory(product?.category ?? categories[0]?.key ?? "home_decor");
    setPrice(product ? String(product.price) : "");
    setWasPrice(product?.promo?.previous_price ? String(product.promo.previous_price) : "");
    setStock((product?.stock_status as any) ?? "in_stock");
    setImages(product?.images ?? []);
  }, [visible, product, categories]);

  const addPhoto = async () => {
    if (images.length >= MAX_PHOTOS || uploading) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - images.length, quality: 0.7, base64: true });
      if (res.canceled || !res.assets.length) return;
      setUploading(true);
      const urls: string[] = [];
      for (const a of res.assets.slice(0, MAX_PHOTOS - images.length)) {
        const dataUrl = a.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : a.uri;
        urls.push((await brandApi.upload(dataUrl)).url);
      }
      setImages((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      toast.error("Couldn't add the photo", e?.message ?? "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const p = Number(price.replace(/[^\d]/g, ""));
    const was = Number(wasPrice.replace(/[^\d]/g, ""));
    if (name.trim().length < 2) return toast.error("Give the product a name");
    if (!p) return toast.error("Enter a price in naira");
    setSaving(true);
    try {
      const body: BrandProductInput = { name: name.trim(), description: description.trim(), category, price: p, images, stock_status: stock, promo_previous_price: was > p ? was : null, promo_label: was > p ? "Reduced price" : null, clear_promo: !(was > p) };
      const saved = product ? await brandApi.updateProduct(product.id, body) : await brandApi.createProduct({ ...body, published: true });
      toast.success(product ? "Product updated" : "Product added", "It shows under Market → Brands right away.");
      onSaved(saved);
      onClose();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={() => (saving ? null : onClose())} title={product ? "Edit product" : "New product"} testID="brand-product-sheet">
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space[4], paddingBottom: space[4] }} style={{ maxHeight: 560 }}>
        <Input label="Product name" value={name} onChangeText={setName} placeholder="e.g. Arc Floor Lamp — Brass" testID="brand-product-name" />
        <Input label="Description" value={description} onChangeText={setDescription} placeholder="Size, material, what's included…" multiline testID="brand-product-description" />
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="secondary">
            Category
          </AppText>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} testID={`brand-cat-${c.key}`} />
            ))}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Input label="Price (₦)" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="185000" testID="brand-product-price" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Was (₦, optional)" value={wasPrice} onChangeText={setWasPrice} keyboardType="number-pad" placeholder="215000" helper="Shows a deal badge" testID="brand-product-was" />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="secondary">
            Stock
          </AppText>
          <View style={styles.chips}>
            {STOCK.map((s) => (
              <Chip key={s.key} label={s.label} selected={stock === s.key} onPress={() => setStock(s.key)} testID={`brand-stock-${s.key}`} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="secondary">
            Photos · {images.length}/{MAX_PHOTOS}
          </AppText>
          <View style={styles.photos}>
            {images.map((u, i) => (
              <View key={u} style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}>
                <Image source={{ uri: u }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <Pressable onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))} style={[styles.remove, { backgroundColor: colors.text }]} accessibilityLabel="Remove photo" testID={`brand-photo-remove-${i}`}>
                  <Ionicons name="close" size={12} color={colors.bg} />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_PHOTOS ? (
              <Pressable onPress={addPhoto} disabled={uploading} style={[styles.photo, styles.add, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="Add photo" testID="brand-photo-add">
                <Ionicons name={uploading ? "cloud-upload-outline" : "add"} size={22} color={colors.textSecondary} />
                <AppText variant="micro" tone="secondary">
                  {uploading ? "Uploading…" : "Add"}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
        <Button label={product ? "Save changes" : "Add to Market"} variant="primary" size="lg" fullWidth iconLeft="checkmark" onPress={save} loading={saving} testID="brand-product-save" />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photo: { width: 84, height: 84, borderRadius: radii.lg, overflow: "hidden" },
  add: { borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", gap: 2 },
  remove: { position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
