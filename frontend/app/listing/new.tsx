import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { api, naira } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PhotoAdder } from "@/src/photos";
import { CITIES } from "@/src/roles";
import { useSettings } from "@/src/settings";
import { fonts, space, useTheme } from "@/src/theme";
import { BigButton, Card, Counter, EmptyState, ScreenHeader, useToast } from "@/src/ui";
import { BigInput, OptionGrid, ReviewRow, Wizard } from "@/src/Wizard";

type Deal = "buy" | "rent" | "shortlet" | "lease";
type Kind = "apartment" | "duplex" | "bungalow" | "terrace" | "penthouse" | "land" | "commercial";
const KIND_EN: Record<Kind, string> = { apartment: "flat", duplex: "duplex", bungalow: "bungalow", terrace: "terrace house", penthouse: "penthouse", land: "plot of land", commercial: "commercial space" };

export default function NewListing() {
  const { t } = useSettings();
  const { colors } = useTheme();
  const { refresh, me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [beds, setBeds] = useState(2);
  const [baths, setBaths] = useState(2);
  const [price, setPrice] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const TOTAL = 7;
  const priceN = parseInt(price.replace(/\D/g, ""), 10) || 0;

  const publish = async () => {
    const c = CITIES.find((x) => x.name === city)!;
    const isLand = kind === "land";
    const where = area.trim() || c.name;
    const title = isLand ? `Plot of land in ${where}` : `${beds}-bedroom ${KIND_EN[kind!]} in ${where}`;
    const verb = deal === "buy" ? "for sale" : deal === "rent" ? "for rent" : deal === "shortlet" ? "for short stay" : "for lease";
    setBusy(true);
    try {
      await api("/properties", {
        body: {
          title,
          description: `${title}, ${c.name} — ${verb}. ${isLand ? "" : `${beds} bedrooms, ${baths} bathrooms. `}Listed with AMASS Partner.`,
          price: priceN,
          listing_type: deal,
          property_type: kind,
          bedrooms: isLand ? 0 : beds,
          bathrooms: isLand ? 0 : baths,
          size_sqm: isLand ? 600 : Math.max(60, beds * 45),
          location: where,
          city: c.name,
          state: c.state,
          latitude: c.lat + (Math.random() - 0.5) * 0.02,
          longitude: c.lng + (Math.random() - 0.5) * 0.02,
          images: photos,
        },
      });
      toast.show(t("published"));
      refresh();
      router.replace("/work?tab=homes");
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };

  const skipRooms = kind === "land" || kind === "commercial";
  const next = () => {
    if (step === 3 && skipRooms) return setStep(5);
    if (step === TOTAL) return publish();
    setStep(step + 1);
  };
  const back = () => setStep(step === 5 && skipRooms ? 3 : step - 1);
  const can = [true, !!deal, !!kind, photos.length > 0, true, priceN > 0, !!city, true][step];

  const questions: Record<number, string> = { 1: t("step_deal"), 2: t("step_kind"), 3: t("step_photos"), 4: t("step_rooms"), 5: t("step_price"), 6: t("step_place"), 7: t("step_check") };

  if (me?.listing_quota && !me.listing_quota.can_add) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title={t("tile_new_listing")} guide="guide_work" extra={t("listing_limit", { n: me.listing_quota.limit })} back />
        <EmptyState icon="lock-closed" text={t("listing_limit", { n: me.listing_quota.limit })}>
          <Text testID="listing-limit-plan" style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.muted, textAlign: "center" }}>
            {me.listing_quota.plan_name} · {me.listing_quota.used}/{me.listing_quota.limit}
          </Text>
          <View style={{ width: 260, gap: space.sm }}>
            <BigButton label={t("tile_my_homes")} icon="home" tone="dark" onPress={() => router.replace("/work?tab=homes")} testID="listing-limit-my-homes" />
          </View>
        </EmptyState>
      </View>
    );
  }

  return (
    <Wizard title={t("tile_new_listing")} step={step} total={TOTAL} question={questions[step]} guide="guide_work" onBack={back} onNext={next} canNext={can} busy={busy} nextLabel={step === TOTAL ? t("publish") : undefined} nextIcon={step === TOTAL ? "cloud-upload" : undefined}>
      {step === 1 ? (
        <OptionGrid
          testPrefix="deal"
          value={deal}
          onChange={(k) => {
            setDeal(k);
            setStep(2);
          }}
          options={[
            { key: "buy", label: t("deal_buy"), icon: "pricetag" },
            { key: "rent", label: t("deal_rent"), icon: "key" },
            { key: "shortlet", label: t("deal_shortlet"), icon: "bed" },
            { key: "lease", label: t("deal_lease"), icon: "document-text" },
          ]}
        />
      ) : null}
      {step === 2 ? (
        <OptionGrid
          testPrefix="kind"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setStep(3);
          }}
          options={[
            { key: "apartment", label: t("kind_apartment"), icon: "business" },
            { key: "duplex", label: t("kind_duplex"), icon: "home" },
            { key: "bungalow", label: t("kind_bungalow"), icon: "home-outline" },
            { key: "terrace", label: t("kind_terrace"), icon: "albums" },
            { key: "penthouse", label: t("kind_penthouse"), icon: "diamond" },
            { key: "land", label: t("kind_land"), icon: "leaf" },
            { key: "commercial", label: t("kind_commercial"), icon: "storefront" },
          ]}
        />
      ) : null}
      {step === 3 ? <PhotoAdder photos={photos} onChange={setPhotos} uploadPath="/partner/upload" /> : null}
      {step === 4 ? (
        <View style={{ gap: space.md }}>
          <Counter label={t("bedrooms")} icon="bed" value={beds} onChange={setBeds} testID="beds" />
          <Counter label={t("bathrooms")} icon="water" value={baths} onChange={setBaths} testID="baths" />
        </View>
      ) : null}
      {step === 5 ? <BigInput testID="price-input" money value={price ? naira(priceN) : ""} onChangeText={setPrice} keyboardType="number-pad" placeholder="₦0" /> : null}
      {step === 6 ? (
        <View style={{ gap: space.md }}>
          <OptionGrid testPrefix="city" value={city} onChange={setCity} options={CITIES.map((c) => ({ key: c.name, label: c.name, icon: "location" }))} />
          <BigInput testID="area-input" value={area} onChangeText={setArea} placeholder={t("area")} />
        </View>
      ) : null}
      {step === 7 ? (
        <Card testID="listing-review">
          <PhotoAdder photos={photos} onChange={setPhotos} uploadPath="/partner/upload" testID="review-photos" />
          <ReviewRow icon="pricetag" label={t("step_deal").replace("?", "")} value={t(`deal_${deal}` as any)} />
          <ReviewRow icon="home" label={t("step_kind").replace("?", "")} value={t(`kind_${kind}` as any)} />
          {!skipRooms ? <ReviewRow icon="bed" label={t("bedrooms")} value={`${beds} · ${baths} ${t("bathrooms")}`} /> : null}
          <ReviewRow icon="cash" label={t("price")} value={naira(priceN)} />
          <ReviewRow icon="location" label={t("city")} value={`${area ? area + ", " : ""}${city}`} />
        </Card>
      ) : null}
    </Wizard>
  );
}
