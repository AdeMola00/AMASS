/**
 * Trust badges for Documents & KYC. Badges only reflect a real AMASS review:
 *  - title documents per listing  (properties.documents_status / documents_verified)
 *  - identity per member          (users.identity_verified)
 */
import React from "react";
import { Badge, type BadgeTone, type IconName } from "@/src/ui";

export type DocsStatus = "none" | "pending" | "verified" | "rejected";
export type KycStatus = "none" | "pending" | "approved" | "rejected";

export const DOCS_META: Record<DocsStatus, { label: string; short: string; tone: BadgeTone; icon: IconName }> = {
  none: { label: "No title documents", short: "No docs", tone: "neutral", icon: "document-outline" },
  pending: { label: "Documents under review", short: "Docs in review", tone: "warning", icon: "time-outline" },
  verified: { label: "Title documents verified", short: "Docs verified", tone: "success", icon: "document-text" },
  rejected: { label: "Documents not accepted", short: "Docs rejected", tone: "error", icon: "alert-circle-outline" },
};

export const KYC_META: Record<KycStatus, { label: string; tone: BadgeTone; icon: IconName }> = {
  none: { label: "Not verified", tone: "neutral", icon: "shield-outline" },
  pending: { label: "Under review", tone: "warning", icon: "time-outline" },
  approved: { label: "Identity verified", tone: "success", icon: "shield-checkmark" },
  rejected: { label: "Needs another look", tone: "error", icon: "alert-circle-outline" },
};

/** Per-listing title-document status (owner/agent contexts show every state; public views should only pass "verified"). */
export function DocumentsBadge({ status, size = "xs", short = true, testID }: { status: DocsStatus; size?: "xs" | "sm" | "md"; short?: boolean; testID?: string }) {
  const m = DOCS_META[status] ?? DOCS_META.none;
  return <Badge label={short ? m.short : m.label} tone={m.tone} icon={m.icon} size={size} testID={testID} />;
}

export function IdentityBadge({ status, size = "xs", testID }: { status: KycStatus; size?: "xs" | "sm" | "md"; testID?: string }) {
  const m = KYC_META[status] ?? KYC_META.none;
  return <Badge label={m.label} tone={m.tone} icon={m.icon} size={size} testID={testID} />;
}
