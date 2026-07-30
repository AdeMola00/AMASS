/**
 * AMASS minimalist map style — Google Maps JSON.
 *
 * Design goals:
 *   • Light neutral background, muted land, soft-blue water
 *   • Thin gray roads, minimal typography
 *   • Suppress ALL POI icons (restaurants, hotels, banks, transit)
 *   • Keep only essential locality/admin labels
 *   • Property markers must visually dominate
 *
 * Apply via `<MapView customMapStyle={mapMinimal} />` (Google provider only).
 */
export const mapMinimal = [
  // Global label typography — thin, muted
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#5b6673" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f8f9fa" }],
  },

  // Base geometry — soft off-white
  {
    elementType: "geometry",
    stylers: [{ color: "#f2f3f5" }],
  },

  // Administrative — subtle boundaries
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7280" }],
  },
  {
    featureType: "administrative.country",
    elementType: "geometry.stroke",
    stylers: [{ color: "#c2c6ce" }],
  },
  {
    featureType: "administrative.province",
    elementType: "geometry.stroke",
    stylers: [{ color: "#d5d8de" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4b5563" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7c848f" }],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },

  // Landscape — muted natural
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#eef1f3" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry",
    stylers: [{ color: "#f5f6f8" }],
  },

  // ─── HIDE ALL POIs (this is a property-first map) ─────────
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.attraction",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.government",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.medical",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.place_of_worship",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.school",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.sports_complex",
    stylers: [{ visibility: "off" }],
  },
  // Parks stay visible but muted (people orient by parks)
  {
    featureType: "poi.park",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#e2ebe2" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },

  // ─── ROADS — soft, thin, minimally labeled ────────────────
  {
    featureType: "road",
    stylers: [{ visibility: "simplified" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f0d6a8" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e0c088" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7c6b3f" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7280" }],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#94a0ac" }],
  },
  // Drop street-level labels at moderate zoom to reduce clutter
  {
    featureType: "road.local",
    elementType: "labels",
    stylers: [{ visibility: "simplified" }],
  },

  // ─── TRANSIT — off (bus/subway/rail lines and stations) ───
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },

  // Water — soft brand-adjacent blue
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#cfe3f2" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6a8fae" }],
  },
];
