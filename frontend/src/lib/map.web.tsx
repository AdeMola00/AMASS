// Web fallback — react-native-maps is native only.
// A lightweight stand-in that projects markers onto the current region so the browser
// preview behaves like a map: pins sit where they belong, zoom / recenter / cluster taps
// work and tapping the backdrop deselects. Real satellite tiles render on device.
import React from "react";
import { View, Text, StyleSheet, Image, Pressable, LayoutChangeEvent } from "react-native";

type LatLng = { latitude: number; longitude: number };
export type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };

type MapProps = {
  children?: React.ReactNode;
  style?: any;
  initialRegion?: Region;
  region?: Region;
  provider?: any;
  mapType?: string;
  pointerEvents?: any;
  onPress?: (e: any) => void;
  onRegionChangeComplete?: (r: Region) => void;
  [key: string]: any;
};

export const PROVIDER_DEFAULT = undefined;
export const IS_MAP_LIMITED_IN_EXPO_GO = false;

const FALLBACK_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const MAP_TILE = "https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1600&q=70";

const RegionCtx = React.createContext<{ region: Region; width: number; height: number } | null>(null);

export const MapView = React.forwardRef<any, MapProps>(function MapView({ children, style, pointerEvents, initialRegion, region: controlled, onPress, onRegionChangeComplete }, ref) {
  const [region, setRegion] = React.useState<Region>(controlled ?? initialRegion ?? FALLBACK_REGION);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const cbRef = React.useRef(onRegionChangeComplete);
  cbRef.current = onRegionChangeComplete;
  React.useEffect(() => {
    if (controlled) setRegion(controlled);
  }, [controlled?.latitude, controlled?.longitude, controlled?.latitudeDelta, controlled?.longitudeDelta]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useImperativeHandle(ref, () => ({
    animateToRegion: (r: Region) => {
      setRegion(r);
      setTimeout(() => cbRef.current?.(r), 0);
    },
    animateCamera: () => {},
    getCamera: async () => ({ heading: 0, pitch: 0 }),
    fitToCoordinates: () => {},
  }));
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  return (
    <View style={[styles.wrap, style]} pointerEvents={pointerEvents} onLayout={onLayout}>
      <Image source={{ uri: MAP_TILE }} style={styles.tile} />
      <View style={styles.tint} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityLabel="Map" testID="web-map-backdrop" />
      <RegionCtx.Provider value={{ region, width: size.width, height: size.height }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {children}
        </View>
      </RegionCtx.Provider>
      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.hint}>Satellite imagery renders on mobile</Text>
      </View>
    </View>
  );
});

export function Marker({
  children,
  onPress,
  coordinate,
  anchor,
}: {
  children?: React.ReactNode;
  coordinate?: LatLng;
  anchor?: { x: number; y: number };
  onPress?: () => void;
  tracksViewChanges?: boolean;
  draggable?: boolean;
  onDragEnd?: (e: any) => void;
  [key: string]: any;
}) {
  const ctx = React.useContext(RegionCtx);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  if (!ctx || !coordinate || !ctx.width) return null;
  const { region, width, height } = ctx;
  const x = ((coordinate.longitude - (region.longitude - region.longitudeDelta / 2)) / region.longitudeDelta) * width;
  const y = ((region.latitude + region.latitudeDelta / 2 - coordinate.latitude) / region.latitudeDelta) * height;
  if (x < -120 || y < -120 || x > width + 120 || y > height + 120) return null;
  const ax = anchor?.x ?? 0.5;
  const ay = anchor?.y ?? 1;
  return (
    <View
      style={[styles.marker, { left: x - box.w * ax, top: y - box.h * ay, opacity: box.w ? 1 : 0 }]}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (w !== box.w || h !== box.h) setBox({ w, h });
      }}
      // @ts-ignore web-only onClick keeps the stand-in tappable
      onClick={onPress}
    >
      {children}
    </View>
  );
}

// No-op web fallbacks for map overlays used on native.
export function Circle(_props: any) { return null; }
export function Heatmap(_props: any) { return null; }
export function Polygon(_props: any) { return null; }

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#1F2A24", overflow: "hidden" },
  tile: { position: "absolute", width: "100%", height: "100%", opacity: 0.55 },
  // Dark, high-contrast wash so the stand-in reads like satellite imagery under the glass chrome.
  tint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(16,28,22,0.55)" },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 10, alignItems: "center" },
  hint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "600",
    backgroundColor: "rgba(17,17,17,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  marker: { position: "absolute" },
});
