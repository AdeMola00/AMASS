import { colors } from "@/src/constants/theme";

export type ListingSource = "owner_listed" | "mandated" | "independent" | "pending";

/**
 * Trust indicators tied to who is listing a property (see AMASS trust model).
 * Colours align with the spec:
 *  🟢 owner_listed  – "Owner Listed"
 *  🔵 mandated      – "Verified Mandated Agent"
 *  🟡 independent   – "Independent Agent"
 *  ⚪ pending       – "Verification Pending"
 */
export function listingSourceMeta(source?: ListingSource) {
  switch (source) {
    case "owner_listed":
      return {
        label: "Owner Listed",
        short: "Owner",
        color: colors.emerald,
        colorAlt: colors.emerald,
        icon: "person-circle" as const,
        dot: "#10B981",
        trustLine: "Listed directly by the property owner.",
      };
    case "mandated":
      return {
        label: "Verified Mandated Agent",
        short: "Mandated",
        color: "#0369A1",
        colorAlt: "#0369A1",
        icon: "shield-checkmark" as const,
        dot: "#0369A1",
        trustLine: "This property is listed by a Verified Mandated Agent.",
      };
    case "independent":
      return {
        label: "Independent Agent",
        short: "Independent",
        color: "#D97706",
        colorAlt: "#D97706",
        icon: "alert-circle" as const,
        dot: "#D97706",
        trustLine:
          "This listing has not been confirmed by the property owner. Exercise due diligence before making any payment.",
      };
    default:
      return {
        label: "Verification Pending",
        short: "Pending",
        color: colors.textTertiary,
        colorAlt: colors.textMuted,
        icon: "time" as const,
        dot: "#A1A1AA",
        trustLine: "AMASS is verifying the source of this listing.",
      };
  }
}
