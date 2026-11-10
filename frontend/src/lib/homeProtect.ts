/**
 * AMASS HOME PROTECT — data layer. Rate cards (admin-entered partner prices) → quote → pay in MASS → policy → claims.
 */
import { qs, req } from "./api";
import type { FileRef, ItemCategory } from "./homeHub";

export type Plan = { key: string; name: string; tagline?: string | null; building_premium_ngn: number; contents_premium_ngn: number; building_limit_ngn: number; contents_limit_ngn: number; excess_ngn: number; perils: string[]; appliance_discount_pct: number; recommended?: boolean };
export type ItemRate = { rate_pct: number; min_premium_ngn: number } | null;
export type RateCard = {
  id: string;
  partner_name: string;
  partner_short?: string | null;
  licence?: string | null;
  claims_phone?: string | null;
  claims_email?: string | null;
  notes?: string | null;
  mass_rate_ngn: number;
  term_months: number;
  max_item_value_ngn: number;
  plans: Plan[];
  item_rates: Record<string, ItemRate>;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
  /** consumer catalog only: peril key → label */
  perils?: Record<string, string>;
};
export type RateCardIn = Omit<RateCard, "id" | "created_at" | "updated_at" | "updated_by" | "perils">;

export type IncidentType = { key: string; label: string; icon: string };
export type Catalog = { open: boolean; rate_card: RateCard | null; incident_types: IncidentType[]; insurable_categories: ItemCategory[]; mass_rate_ngn: number; term_months: number };

export type PolicyState = "active" | "expiring" | "expired" | "cancelled";
export type PolicyItem = { item_id: string; name: string; category: ItemCategory; room?: string | null; photo?: FileRef | null; value: number; premium_ngn: number; added_at?: string };
export type Policy = {
  id: string;
  policy_no: string;
  user_id: string;
  home_id: string;
  home_name?: string | null;
  home_address?: string | null;
  partner_name: string;
  plan_key: string;
  plan_name: string;
  cover: { include_building: boolean; building_limit_ngn: number; contents_limit_ngn: number; excess_ngn: number; perils: string[] };
  items: PolicyItem[];
  breakdown: { building_ngn: number; contents_ngn: number; appliances_ngn: number };
  total_ngn: number;
  total_mass: number;
  initial_total_ngn?: number;
  initial_total_mass?: number;
  mass_rate_ngn: number;
  starts_at: string;
  expires_at: string;
  term_months: number;
  status: "active" | "cancelled";
  paid_at: string;
  created_at: string;
  state: PolicyState;
  days_left: number | null;
  insured_items: number;
  insured_value_ngn: number;
  /* detail only */
  claims?: Claim[];
  partner?: { partner_name?: string; claims_phone?: string | null; claims_email?: string | null; licence?: string | null };
  perils_labels?: string[];
  addable_items?: { id: string; name: string; category: ItemCategory; value: number | null; photo?: FileRef | null }[];
  /* pay response extras */
  receipt_no?: string | null;
  balance_after?: number;
  added_items?: number;
};

export type QuoteLine = { item_id: string; name: string; category: ItemCategory; room?: string | null; photo?: FileRef | null; value: number; rate_pct: number; premium_ngn: number; premium_ngn_prorated?: number };
export type Quote = {
  id: string;
  kind: "new" | "addon";
  home_id: string;
  home_name?: string | null;
  policy_id: string | null;
  partner_name: string;
  plan_key: string;
  plan_name: string;
  plan?: Plan;
  include_building: boolean;
  items: QuoteLine[];
  skipped: { item_id: string; name: string; reason: string }[];
  already_covered: { id: string; name: string }[];
  breakdown: { building_ngn: number; contents_ngn: number; appliances_ngn: number; appliances_annual_ngn?: number; prorate_factor?: number; days_left?: number };
  total_ngn: number;
  total_mass: number;
  mass_rate_ngn: number;
  term_months: number;
  starts_at: string;
  expires_at: string;
  status: "quoted" | "paid" | "expired";
  wallet: { balance: number; shortfall: number };
};

export type ClaimStatus = "submitted" | "under_review" | "more_info" | "approved" | "rejected" | "paid";
export type ClaimScope = "appliance" | "contents" | "building";
export type TimelineEntry = { at: string; status: ClaimStatus; by: "you" | "insurer"; note?: string | null; photos?: FileRef[] };
export type Claim = {
  id: string;
  claim_no: string;
  user_id: string;
  home_id: string;
  home_name?: string | null;
  policy_id: string;
  policy_no: string;
  partner_name?: string | null;
  plan_name?: string | null;
  scope: ClaimScope;
  item_id?: string | null;
  item_name?: string | null;
  item_photo?: FileRef | null;
  item_value?: number | null;
  incident_type: string;
  incident_label: string;
  incident_date: string;
  description: string;
  amount_claimed_ngn?: number | null;
  photos: FileRef[];
  status: ClaimStatus;
  status_label: string;
  is_open: boolean;
  coverage_warning?: string | null;
  payout_ngn?: number | null;
  payout_mass?: number | null;
  admin_note?: string | null;
  timeline: TimelineEntry[];
  created_at: string;
  updated_at: string;
  paid_at?: string | null;
  partner?: { partner_name?: string; claims_phone?: string | null; claims_email?: string | null };
  /* admin */
  user?: { name?: string | null; email?: string | null; phone?: string | null };
  policy?: Policy;
  item?: any;
  mass_rate_ngn?: number;
};

export type ProtectStatus = {
  today: string;
  open: boolean;
  live: Policy | null;
  policies: Policy[];
  claims: Claim[];
  open_claims: number;
  items_total: number;
  items_protected: number;
  unprotected_insurable: { id: string; name: string; category: ItemCategory; value: number | null; photo?: FileRef | null }[];
};

export type AdminSummary = { policies_live: number; policies_total: number; items_insured: number; premiums_mass: number; claims_open: number; claims_paid: number; payouts_mass: number; rate_cards: number; rate_card_active: boolean };

export const CLAIM_TONE: Record<ClaimStatus, "neutral" | "info" | "warning" | "success" | "error" | "mass"> = { submitted: "neutral", under_review: "info", more_info: "warning", approved: "success", rejected: "error", paid: "mass" };
export const CLAIM_ICON: Record<ClaimStatus, string> = { submitted: "paper-plane", under_review: "search", more_info: "chatbubble-ellipses", approved: "checkmark-circle", rejected: "close-circle", paid: "cash" };

const j = (b: unknown) => JSON.stringify(b);

export const protectApi = {
  catalog: () => req<Catalog>("/home/protect/catalog"),
  status: (home_id?: string | null) => req<ProtectStatus>(`/home/protect/status${qs({ home_id })}`),
  quote: (body: { home_id: string; plan_key?: string | null; include_building?: boolean; item_ids: string[]; policy_id?: string | null }) => req<Quote>("/home/protect/quote", { method: "POST", body: j(body) }),
  getQuote: (id: string) => req<Quote>(`/home/protect/quotes/${id}`),
  pay: (quoteId: string) => req<Policy>(`/home/protect/quotes/${quoteId}/pay`, { method: "POST" }),
  policies: (home_id?: string | null) => req<{ items: Policy[]; today: string }>(`/home/protect/policies${qs({ home_id })}`),
  policy: (id: string) => req<Policy>(`/home/protect/policies/${id}`),
  claims: (home_id?: string | null) => req<{ items: Claim[] }>(`/home/protect/claims${qs({ home_id })}`),
  claim: (id: string) => req<Claim>(`/home/protect/claims/${id}`),
  createClaim: (body: { id?: string; policy_id: string; scope: ClaimScope; item_id?: string | null; incident_type: string; incident_date: string; description: string; amount_claimed_ngn?: number | null; photos: FileRef[] }) => req<Claim>("/home/protect/claims", { method: "POST", body: j(body) }),
  replyClaim: (id: string, body: { message: string; photos: FileRef[] }) => req<Claim>(`/home/protect/claims/${id}/reply`, { method: "POST", body: j(body) }),
  /* admin */
  adminSummary: () => req<AdminSummary>("/home/protect/admin/summary"),
  adminRateCards: () => req<{ items: RateCard[]; categories: { key: ItemCategory; label: string; icon: string }[]; perils: IncidentType[] }>("/home/protect/admin/rate-cards"),
  adminCreateRateCard: (body: RateCardIn) => req<RateCard>("/home/protect/admin/rate-cards", { method: "POST", body: j(body) }),
  adminUpdateRateCard: (id: string, body: RateCardIn) => req<RateCard>(`/home/protect/admin/rate-cards/${id}`, { method: "PUT", body: j(body) }),
  adminActivateRateCard: (id: string) => req<{ ok: boolean }>(`/home/protect/admin/rate-cards/${id}/activate`, { method: "POST" }),
  adminPolicies: () => req<{ items: Policy[] }>("/home/protect/admin/policies"),
  adminClaims: (status: "open" | "closed" | "all" = "open") => req<{ items: Claim[]; counts: { open: number; closed: number } }>(`/home/protect/admin/claims${qs({ status })}`),
  adminClaim: (id: string) => req<Claim>(`/home/protect/admin/claims/${id}`),
  adminDecide: (id: string, body: { status: ClaimStatus; note?: string | null; payout_ngn?: number | null }) => req<Claim>(`/home/protect/admin/claims/${id}/decide`, { method: "POST", body: j(body) }),
};
