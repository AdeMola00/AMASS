// Native re-exports of react-native-maps
// Force Google Maps provider on both iOS and Android (API keys set in app.json).
export { default as MapView } from "react-native-maps";
export { Marker, PROVIDER_GOOGLE as PROVIDER_DEFAULT } from "react-native-maps";
export type { Region } from "react-native-maps";
