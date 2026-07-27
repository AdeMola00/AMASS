// Web fallback — react-native-maps is native only.
// We render a lightweight placeholder that still supports children and props
// used across the app so the bundle compiles for the browser preview.
import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";

type LatLng = { latitude: number; longitude: number };
export type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };

type MapProps = {
  children?: React.ReactNode;
  style?: any;
  initialRegion?: Region;
  provider?: any;
  mapType?: string;
  showsCompass?: boolean;
  showsMyLocationButton?: boolean;
  toolbarEnabled?: boolean;
  pointerEvents?: any;
  onPress?: (e: any) => void;
};

export const PROVIDER_DEFAULT = undefined;

const MAP_TILE =
  "https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1200&q=75";

export const MapView = React.forwardRef<any, MapProps>(function MapView(
  { children, style, pointerEvents },
  ref
) {
  React.useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
  }));
  return (
    <View style={[styles.wrap, style]} pointerEvents={pointerEvents}>
      <Image source={{ uri: MAP_TILE }} style={styles.tile} />
      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.hint}>Interactive map available on mobile</Text>
      </View>
      <View style={styles.markers} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
});

export function Marker({ children }: { children?: React.ReactNode; coordinate?: LatLng; anchor?: any; onPress?: () => void; tracksViewChanges?: boolean; draggable?: boolean; onDragEnd?: (e: any) => void }) {
  // On web we only render the first few markers roughly to give a hint of density.
  return <View style={styles.marker}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#E4E4E7", overflow: "hidden" },
  tile: { position: "absolute", width: "100%", height: "100%", opacity: 0.6 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    color: "#71717A",
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  markers: { flexDirection: "row", flexWrap: "wrap", padding: 20, gap: 8 },
  marker: { alignSelf: "flex-start" },
});
