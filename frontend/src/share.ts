import { Linking } from "react-native";

import { api } from "@/src/api";

// Uses the AMASS share bundle: wa.me link with a ready message + smart link that opens AMASS for buyers.
export async function shareListingOnWhatsApp(propertyId: string) {
  const r = await api<{ whatsapp_url: string }>(`/share/property/${propertyId}`, { auth: false });
  // api.whatsapp.com keeps emojis intact on web (wa.me's redirect can garble them).
  await Linking.openURL(r.whatsapp_url.replace("https://wa.me/?text=", "https://api.whatsapp.com/send?text="));
}
