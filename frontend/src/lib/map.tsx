// Native re-exports of react-native-maps.
//
// Expo Go can NOT use the Google Maps API key from app.json (it's baked into
// Expo Go's own binary with its own restricted key). Forcing PROVIDER_GOOGLE
// there causes blank tiles / broken maps.
//
// Strategy:
//   • Dev-client / production build → PROVIDER_GOOGLE  (uses YOUR api key)
//   • Expo Go                        → default provider (Apple on iOS, native
//                                                        on Android — no key
//                                                        needed, renders OK)
//
// The map screen imports `PROVIDER_DEFAULT` from here; nothing else changes.

import Constants from "expo-constants";
import { Platform } from "react-native";
import Maps, {
  Marker,
  Circle,
  Heatmap,
  Polygon,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT as RNM_PROVIDER_DEFAULT,
} from "react-native-maps";
import type { Region } from "react-native-maps";

// Expo Go reports executionEnvironment === "storeClient".
// Dev-client / standalone reports "standalone" or "bare".
const IS_EXPO_GO = Constants.executionEnvironment === "storeClient";

// On web we don't render native maps at all; the .web.tsx file handles that.
// On native:  Expo Go → default provider, otherwise → Google.
const PROVIDER_DEFAULT =
  Platform.OS === "web" || IS_EXPO_GO ? RNM_PROVIDER_DEFAULT : PROVIDER_GOOGLE;

export const IS_MAP_LIMITED_IN_EXPO_GO = IS_EXPO_GO;
export { Maps as MapView, Marker, Circle, Heatmap, Polygon, PROVIDER_DEFAULT };
export type { Region };
