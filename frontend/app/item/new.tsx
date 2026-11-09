import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PhotoAdder } from "@/src/photos";
import { CITIES } from "@/src/roles";
import { useSettings } from "@/src/settings";
import { space } from "@/src/theme";
import { Card, LoadingView, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";
import { BigInput, OptionGrid, ReviewRow, Wizard } from "@/src/Wizard";

export default function NewItem() {
  const { t } = useSettings();
  const { refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const cats = useLoad(() => api<any[]>("/marketplace/categories"));
  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [city, setCity] = useState<string | null>("Lagos");
  const [busy, setBusy] = useState(false);
  const TOTAL = 5;
  const priceN = parseInt(price.replace(/\D/g, ""), 10) || 0;
  const options = (cats.data ?? []).filter((c) => !["services", "real_estate"].includes(c.key)).map((c) => ({ key: c.key as string, label: c.label as string, icon: c.icon || "cube" }));
  const catLabel = options.find((o) => o.key === cat)?.label || "";

  const publish = async () => {
    setBusy(true);
    try {
      await api("/marketplace/items", {
        body: { name: name.trim(), description: `${name.trim()} — for sale on AMASS Market.`, price: priceN, category: cat, subcategory: catLabel, condition: "used", image: photos[0], images: photos, city, location: city },
      });
      toast.show(t("published_item"));
      refresh();
      router.replace("/work?tab=items");
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };

  const q: Record<number, string> = { 1: t("step_item_photo"), 2: t("step_item_name"), 3: t("step_item_cat"), 4: t("item_price_q"), 5: t("step_check") };
  const can = [true, photos.length > 0, name.trim().length >= 3, !!cat, priceN > 0 && !!city, true][step];

  if (cats.loading && !cats.data) return <LoadingView />;

  return (
    <Wizard title={t("tile_add_item")} step={step} total={TOTAL} question={q[step]} guide="guide_work" onBack={() => setStep(step - 1)} onNext={() => (step === TOTAL ? publish() : setStep(step + 1))} canNext={can} busy={busy} nextLabel={step === TOTAL ? t("publish") : undefined} nextIcon={step === TOTAL ? "cloud-upload" : undefined}>
      {step === 1 ? <PhotoAdder photos={photos} onChange={setPhotos} uploadPath="/partner/upload" max={5} /> : null}
      {step === 2 ? <BigInput testID="item-name-input" value={name} onChangeText={setName} placeholder={t("item_name")} autoFocus /> : null}
      {step === 3 ? (
        <OptionGrid
          testPrefix="cat"
          value={cat}
          onChange={(k) => {
            setCat(k);
            setStep(4);
          }}
          options={options}
        />
      ) : null}
      {step === 4 ? (
        <View style={{ gap: space.lg }}>
          <BigInput testID="item-price-input" money value={price ? naira(priceN) : ""} onChangeText={setPrice} keyboardType="number-pad" placeholder="₦0" />
          <OptionGrid testPrefix="item-city" value={city} onChange={setCity} options={CITIES.slice(0, 6).map((c) => ({ key: c.name, label: c.name, icon: "location" }))} />
        </View>
      ) : null}
      {step === 5 ? (
        <Card testID="item-review">
          <PhotoAdder photos={photos} onChange={setPhotos} uploadPath="/partner/upload" max={5} testID="review-photos" />
          <ReviewRow icon="pricetag" label={t("item_name")} value={name} />
          <ReviewRow icon="grid" label={t("group")} value={catLabel} />
          <ReviewRow icon="cash" label={t("price")} value={naira(priceN)} />
          <ReviewRow icon="location" label={t("city")} value={city || ""} />
        </Card>
      ) : null}
    </Wizard>
  );
}
