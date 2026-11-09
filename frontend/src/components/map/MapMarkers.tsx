/**
 * Everything drawn ON the map: cluster discs, price pins, the empty-wallet ghost pins and the one-time
 * "tap a pin" coach mark. Pure rendering — selection, saving and zooming are decided by the screen.
 */
import React from "react";
import * as Haptics from "expo-haptics";
import { Marker } from "@/src/lib/map";
import type { TeaserPin } from "./GhostPin";
import { GhostPin } from "./GhostPin";
import { PinTapHint } from "./PinTapHint";
import { ClusterPin, PricePin } from "./PricePin";
import { pinState, type Pin } from "./pins";

type Props = {
  clusters: any[];
  activeId: string | null;
  savedIds: Set<string>;
  viewedIds: Set<string>;
  /** Keep marker views live while pins spring in (perf: frozen snapshots otherwise). */
  settling: boolean;
  gated: boolean;
  teaser: TeaserPin[];
  hintPin: Pin | null;
  hintW: number;
  reduceMotion: boolean;
  onMarkerPress: (p: Pin) => void;
  onClusterPress: (clusterId: number, lat: number, lng: number) => void;
};

export function MapMarkers({ clusters, activeId, savedIds, viewedIds, settling, gated, teaser, hintPin, hintW, reduceMotion, onMarkerPress, onClusterPress }: Props) {
  return (
    <>
      {clusters.map((c: any) => {
        if (c.properties?.cluster) {
          const [lng, lat] = c.geometry.coordinates as [number, number];
          const count = c.properties.point_count as number;
          return (
            <Marker
              key={`cluster-${c.properties.cluster_id}`}
              coordinate={{ latitude: lat, longitude: lng }}
              accessibilityLabel={`${count} homes here. Tap to zoom in.`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onClusterPress(c.properties.cluster_id, lat, lng);
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <ClusterPin count={count} testID={`cluster-${c.properties.cluster_id}`} />
            </Marker>
          );
        }
        const p = c.properties.property as Pin;
        const state = pinState(p, { active: p.id === activeId, saved: savedIds.has(p.id), viewed: viewedIds.has(p.id) });
        return (
          // Re-keyed on state so the snapshot (tracksViewChanges=false) refreshes when a pin is saved / viewed / unlocked.
          <Marker
            key={`${p.id}:${state}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            accessibilityLabel={`${p.category === "sale" ? "For sale" : "To rent"} ${p.type ?? "home"}${p.price ? `, ${p.price.toLocaleString()} naira` : ""}. ${state === "unlocked" ? "Unlocked." : state === "saved" ? "Saved." : state === "viewed" ? "Viewed." : ""} ${p.unlocked ? "Tap to preview." : "Approximate location — tap to preview."}`}
            onPress={() => onMarkerPress(p)}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={settling || state === "selected"}
            zIndex={state === "selected" ? 20 : p.boosted ? 6 : p.unlocked ? 4 : state === "saved" ? 3 : 2}
          >
            <PricePin pin={p} state={state} testID={`pin-${p.id}`} />
          </Marker>
        );
      })}
      {gated
        ? teaser.map((g, i) => (
            <Marker key={`ghost-${i}`} coordinate={{ latitude: g.lat, longitude: g.lng }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} zIndex={1}>
              <GhostPin pin={g} testID={`ghost-pin-${i}`} />
            </Marker>
          ))
        : null}
      {hintPin && !gated ? (
        // Rides with the map above its pin; tapping it is tapping the pin. Animated, so it tracks view changes (one marker, ≤15 s).
        <Marker key={`hint-${hintPin.id}`} coordinate={{ latitude: hintPin.lat, longitude: hintPin.lng }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges zIndex={30} onPress={() => onMarkerPress(hintPin)} accessibilityLabel="Tap a pin to preview the home">
          <PinTapHint width={hintW} reduceMotion={reduceMotion} testID="pin-tap-hint" />
        </Marker>
      ) : null}
    </>
  );
}
