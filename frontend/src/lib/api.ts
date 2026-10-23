import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const AUTH_KEY = "amass_auth_token";

export type PromotionTier = "promote" | "feature" | "boost";
export type PromotionInfo = { tier: PromotionTier; starts_at?: string; expires_at: string | null; days_left: number };
export type PromotionTierConfig = { tokens: number; days: number; label: string; perk: string; placements: string[]; uplift: number };
export type PromotionPreview = {
  property: { id: string; title?: string; price?: number; listing_type?: string; property_type?: string; bedrooms?: number; bathrooms?: number; size_sqm?: number; location?: string; city?: string; verified: boolean; status: string; image?: string | null };
  balance: number;
  currency: "MASS";
  tiers: Record<PromotionTier, PromotionTierConfig & { balance_after: number; affordable: boolean; estimated_views: number; extends_active: boolean }>;
  placements: Record<string, { label: string; caption: string; icon: string }>;
  reach: { views_30d: number; city_seekers_30d: number; matched_buyers: number; competing_listings: number; promoted_competitors: number; current_rank: number; estimated_views: Record<string, number>; city: string };
  active: PromotionInfo | null;
};
export type ListingStory = {
  role: "agent" | "admin" | "buyer";
  share_url: string;
  caption: string;
  property: { id: string; title?: string; price?: number; currency?: string; listing_type?: string; property_type?: string; bedrooms?: number; bathrooms?: number; size_sqm?: number; city?: string; state?: string; location?: string; images: string[]; verified?: boolean; amenities?: string[]; description?: string; ai_valuation?: number | null; status?: string };
  agent: { full_name?: string | null; avatar_url?: string | null; badge?: { label?: string } | null; slug?: string | null; agency?: string | null } | null;
  brand: { name: string; tagline: string; domain: string; accent: string; ink: string };
};

export type Property = {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  listing_type: "buy" | "rent" | "lease" | "shortlet";
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  size_sqm: number;
  location: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  images: string[];
  amenities: string[];
  status: "available" | "coming_soon" | "verified" | "premium" | "sold";
  verified: boolean;
  listing_source?: "owner_listed" | "mandated" | "independent" | "pending";
  mandate?: {
    owner_name?: string;
    owner_phone?: string;
    mandate_type?: "exclusive" | "sole" | "open" | "verbal";
    mandate_expiry?: string;
    documents?: string[];
  } | null;
  agent_name?: string;
  agent_avatar?: string;
  agent_id?: string;
  agent_phone?: string;
  agent_email?: string;
  year_built?: number;
  parking?: number;
  investment_score?: number;
  ai_valuation?: number;
  views_recent?: number;
  favorites_recent?: number;
  created_at?: string;
  /** Active paid visibility upgrade (null/undefined when none). */
  promotion?: PromotionInfo | null;
  // Token economy
  is_amass_exclusive?: boolean;
  is_free_amass_sale?: boolean;
  token_cost?: number;
  access_cost?: number;
  agent_contact_cost?: number;
  unlocked?: boolean;
  agent_unlocked?: boolean;
};

export type Currency = "MASS" | "FIX";

export type WalletDto = {
  currency?: Currency;  // undefined = legacy MASS wallet
  balance: number;
  bonus_balance: number;
  spendable: number;
  locked: number;
  lifetime_earned: number;
  lifetime_used: number;
  subscription?: any | null;
};

export type DualWalletDto = {
  mass: WalletDto;
  fix: WalletDto;
};

export type TokenBundle = {
  id: string;
  name: string;
  tokens: number;
  bonus: number;
  price_ngn: number;
};

export type FixEarnRule = {
  event: string;
  amount: number;
  description: string;
};

export type FixSpendRule = {
  action: string;
  amount: number;
  description: string;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  price_ngn: number;
  monthly_tokens: number;
  perks: string[];
};

export type WalletTransaction = {
  id: string;
  currency?: Currency;  // undefined = legacy MASS
  kind: string;
  amount: number;
  balance_after: number;
  description: string;
  meta: Record<string, any>;
  created_at: string;
  // Monetization ledger extras (unlock charges / credits)
  feature_key?: "property" | "fixa_provider";
  category?: string | null;
  zone_tier?: string | null;
  price_snapshot?: { amount: number; currency: string; token_ngn: number; ngn: number } | null;
  status?: string;
  auto_credit?: boolean;
};

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string;
  phone?: string | null;
  phone_verified?: boolean;
  avatar_url?: string;
  city?: string | null;
  is_agent: boolean;
  is_admin?: boolean;
  created_at: string;
};

// ─── Neighbours (social) types ───────────────────────────
export type PublicUser = {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  handle?: string | null;
  city?: string | null;
  verified?: boolean;
  is_agent?: boolean;
  badges?: string[];
  member_since?: number | null;
};
export type ConnectionState = { status: "pending" | "accepted" | "declined"; requested_by_me: boolean; id?: string } | null;
export type Connection = { id: string; status: string; requested_by_me: boolean; message?: string | null; created_at: string; user: PublicUser };
export type SocialMe = PublicUser & {
  bio?: string | null;
  settings: { discoverable_by_contacts: boolean; discoverable_by_handle: boolean; share_saves: boolean; contact_match_enabled: boolean; contact_match_last_at?: string | null; has_phone: boolean };
  recognition: { points: number; badges: { key: string; label: string }[] };
  counts: { connections: number; pending_in: number; collections: number; estates: number };
};
export type SharedCollection = {
  id: string; name: string; emoji?: string | null; kind: "homes" | "places" | "shopping"; description?: string | null; owner_id: string; is_owner: boolean;
  members: PublicUser[]; member_count: number; item_count: number; cover_images: string[]; updated_at?: string; created_at: string;
  last_activity?: { kind: string; user_id: string; label?: string; at: string } | null;
};
export type CollectionItem = {
  id: string; kind: "property" | "place" | "product" | "store"; target_id: string; note?: string | null; added_by?: PublicUser | null; created_at: string;
  reactions: { love: number; maybe: number; no: number; mine?: "love" | "maybe" | "no" | null }; comment_count: number;
  property?: Property | null; place?: Place | null; product?: ShopProduct | null; store?: ShopRetailer | null;
};
export type CollectionComment = { id: string; collection_id: string; item_id?: string | null; user_id: string; text: string; created_at: string; user?: PublicUser | null };
export type CollectionDetail = SharedCollection & { invite_code?: string | null; items: CollectionItem[]; comments: CollectionComment[] };
export type PropertySocialContext = Record<string, { saved_by: PublicUser[]; in_collections: { id: string; name: string; emoji?: string | null; shared: boolean }[] }>;

// ─── Shop (Brands → Lagos home-shopping) ───
export type ShopVerified = { source?: string | null; verified_at?: string | null };
export type ShopCategory = { key: string; label: string; icon: string; color: string; count?: number };
export type ShopFilter = { key: string; label: string; icon: string; count: number };
export type ShopPurchaseRoute = { kind: "website" | "whatsapp" | "call"; label: string; url: string };
export type ShopFulfilment = { available: boolean | null; note?: string | null } & ShopVerified;
export type ShopRetailerBrief = { id: string; slug: string; name: string; short_name: string; logo_url: string | null; accent: string; verification_status: "verified" | "partial" | "unverified" };
export type ShopRetailer = ShopRetailerBrief & {
  tagline?: string | null; categories: string[]; category_labels: string[]; brands: string[]; area: string; areas: string[];
  locations: { name: string; address: string; area?: string; phone?: string | null; lat?: number; lng?: number }[]; hours?: string | null;
  fulfilment: Record<"delivery" | "pickup" | "showroom" | "installation", ShopFulfilment>;
  fulfilment_lines: ({ key: string; label: string; note?: string | null } & ShopVerified)[];
  tags: ({ key: string; label: string } & ShopVerified)[];
  verification: { status: string; last_verified_at?: string | null; sources?: string[]; note?: string | null };
  website?: string | null; shop_url?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null;
  product_count: number; deal_count: number; in_stock_count: number; checkout_connected: boolean; purchase_routes: ShopPurchaseRoute[]; sponsored: boolean; badge?: string | null; saved?: boolean;
};
export type ShopPrice = { kind: "fixed" | "from" | "on_request"; amount: number | null; currency: string; rrp?: number | null; note?: string | null; source_url?: string | null; verified_at?: string | null };
export type ShopPromo = { label: string; previous_price?: number | null; expires_at?: string | null; terms?: string | null; source_url?: string | null; verified_at?: string | null };
export type ShopProduct = {
  id: string; retailer: ShopRetailerBrief | null; name: string; brand?: string | null; category: string; subcategory?: string | null; spec?: string | null; specs: Record<string, string>;
  description?: string | null; images: string[]; price: ShopPrice; promo: ShopPromo | null; stock: { status: "in_stock" | "out_of_stock" | "unknown"; qty?: number | null; verified_at?: string | null };
  variants: { label: string; note?: string | null }[]; warranty: ({ label: string; url?: string | null } & ShopVerified) | null; tags: string[]; source_url?: string | null; last_verified_at?: string | null;
  share_url: string; sponsored: boolean; saved: boolean; in_basket_qty: number; friends_saved: number; friends: PublicUser[]; sku?: string | null;
};
export type ShopProductDetail = ShopProduct & { retailer_detail: ShopRetailer | null; purchase_routes: ShopPurchaseRoute[]; in_lists: { id: string; name: string; emoji?: string | null; shared: boolean }[]; similar: ShopProduct[] };
export type ShopSection = { key: string; kind: "retailers" | "products"; title: string; subtitle?: string; see_all?: string; retailers?: ShopRetailer[]; products?: ShopProduct[] };
export type ShopBanner = { key: string; title: string; body: string; cta: string; route: string; tone: "warning" | "brand" | "info"; image?: string | null };
export type ShopHome = {
  area: string; categories: ShopCategory[]; filters: ShopFilter[]; retailers: ShopRetailer[]; retailer_total: number; banners: ShopBanner[]; sections: ShopSection[];
  basket: { count: number; retailers: number }; saved: { products: string[]; stores: string[] }; generated_at: string;
};
export type ShopRetailerDetail = ShopRetailer & {
  product_categories: ShopCategory[]; subcategories: { key: string; label: string; count: number }[];
  promotions: { product_id: string; label: string; name: string; price: number | null; previous_price?: number | null; terms?: string | null; expires_at?: string | null; verified_at?: string | null; source_url?: string | null }[];
  featured: ShopProduct[]; basket: { count: number; subtotal: number }; fees_note: string; catalogue_note?: string;
};
export type ShopBasketGroup = {
  retailer: ShopRetailer; items: { product: ShopProduct; qty: number; line_total: number | null; added_at?: string }[]; item_count: number; subtotal: number; unpriced_count: number; has_from_prices: boolean;
  fees: null; fees_note: string; purchase_routes: ShopPurchaseRoute[]; checkout_connected: boolean; updated_at?: string;
};
export type ShopBasket = { groups: ShopBasketGroup[]; total_items: number; retailer_count: number };
export type ShopSearchResult = { q: string; stores: ShopRetailer[]; brands: string[]; categories: ShopCategory[]; products: ShopProduct[] };

export type Estate = {
  id: string; name: string; slug: string; city: string; state?: string | null; area?: string | null; description?: string | null; latitude?: number | null; longitude?: number | null;
  cover_image?: string | null; amenities: string[]; rules?: string | null; status: string; verification_methods: string[]; pilot?: boolean;
  membership: { status: "pending" | "approved" | "rejected"; role: "resident" | "manager"; joined_at?: string | null; verification_method?: string | null } | null;
  member_count?: number; upcoming_events?: number; open_questions?: number; distance_km?: number;
  managers?: PublicUser[]; is_manager?: boolean; pending_requests?: number; join_code?: string | null; teaser?: { recent_activity_count: number };
};
export type EstatePost = {
  id: string; estate_id: string; group_id?: string | null; author?: PublicUser | null; type: "notice" | "question" | "recommendation" | "general"; is_official: boolean;
  title?: string | null; body: string; place_id?: string | null; tags: string[]; answers_count: number; accepted_reply_id?: string | null; upvoted?: boolean; upvote_count: number; pinned?: boolean; status: string; created_at: string; estate_name?: string;
};
export type PostReply = { id: string; post_id: string; author?: PublicUser | null; body: string; is_accepted: boolean; created_at: string };
export type EstateGroup = { id: string; estate_id: string; name: string; description?: string | null; emoji?: string | null; member_count: number; joined: boolean };
export type EstateMember = { id: string; user: PublicUser; role: "resident" | "manager"; status: string; verification_method?: string | null; created_at: string; approved_at?: string | null; has_proof?: boolean; note?: string | null };
export type CommunityEvent = {
  id: string; title: string; description?: string | null; kind: "gathering" | "viewing" | "activity" | "meeting"; starts_at: string; ends_at?: string | null; location_label: string; latitude?: number | null; longitude?: number | null;
  audience: "estate" | "connections" | "public"; estate_id?: string | null; estate_name?: string | null; property_id?: string | null; capacity?: number | null; host?: PublicUser | null; conversation_id?: string | null; status: string;
  my_rsvp?: "going" | "maybe" | "declined" | null; going_count: number; maybe_count: number; is_host: boolean; going?: PublicUser[]; property?: Partial<Property> | null;
};
export type Place = {
  id: string; name: string; category: string; latitude: number; longitude: number; address_label?: string | null; estate_id?: string | null; is_amenity: boolean; is_promoted?: boolean; label?: string | null;
  recommendation_count: number; recommended_by_me: boolean; distance_km?: number; notes?: { user_id: string; text: string; at: string; user?: PublicUser | null }[]; recommenders?: PublicUser[]; verified_resident_recommendations?: number; status?: string;
};
export type ServiceRequest = {
  id: string; estate_id: string; reporter?: PublicUser | null; category: string; title: string; description: string; location_label?: string | null; photos: string[]; urgent: boolean;
  status: "open" | "acknowledged" | "in_progress" | "resolved" | "closed"; fixa_item_id?: string | null; fixa_provider?: { id: string; name: string; seller_name?: string; subcategory?: string; image?: string; rating?: number } | null;
  updates: { by?: string; status: string; note?: string | null; at: string; user?: PublicUser | null }[]; created_at: string; updated_at: string; is_mine: boolean; can_manage?: boolean;
};
export type FunnelWindow = {
  marker_impressions: number; marker_taps: number; detail_views: number; paid_action_starts: number; payments_completed: number; payments_failed: number;
  tap_rate: number | null; detail_to_start: number | null; start_to_paid: number | null;
};
export type FunnelVia = "direct" | "friend" | "collection" | "estate" | "recommendation" | "share" | "search";
export type AdminFunnel = {
  days: number; since: string; current: FunnelWindow; previous: FunnelWindow;
  attribution: Record<FunnelVia, { detail_views: number; paid_action_starts: number; payments_completed: number }>;
  signin: { starts: number; otp_sent: number; otp_verified: number; completed: number; phone_completed: number };
  social: {
    contact_match_optins: number; connections_sent: number; connections_accepted: number; estate_requests: number; estate_approvals: number; active_estates: number;
    collections_created: number; collections_shared: number; collection_items_added: number; event_rsvps: number; questions_asked: number; questions_answered: number; service_requests: number;
  };
  moderation: { reports_open: number; reports_resolved: number; median_response_hours: number | null; feedback_count: number };
  note: string;
};
export type SocialReport = {
  id: string; reporter_id: string; target_type: "user" | "post" | "reply" | "event" | "place" | "comment" | "collection"; target_id: string; reason: string; details?: string | null;
  estate_id?: string | null; status: "OPEN" | "RESOLVED"; resolution?: string | null; created_at: string; resolved_at?: string | null;
  reporter?: PublicUser | null; target_user?: PublicUser | null; estate_name?: string | null; target_preview?: string; target_status?: string | null;
};

export type NeighboursHome = {
  estates: Estate[];
  connections: { count: number; pending_in: number; preview: PublicUser[] };
  collections: { id: string; name: string; emoji?: string | null; item_count: number; member_count: number; cover_images: string[]; members: PublicUser[] }[];
  events: CommunityEvent[];
  open_questions: EstatePost[];
  notices: EstatePost[];
  open_service_requests: number;
  profile: { handle?: string | null; points: number; badges: string[]; contacts_on: boolean };
  phone_verified: boolean;
};
export type PhoneStartOut = { ok: boolean; phone: string; phone_masked: string; expires_in: number; cooldown_seconds: number; provider: string; mocked: boolean; dev_hint?: string };

export type MarketplaceItem = {
  id: string;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  price: number;
  original_price?: number;
  image: string;
  images: string[];
  vendor: string;
  vendor_id?: string;
  rating: number;
  reviews: number;
  location?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  verified: boolean;
  delivery: boolean;
  delivery_days: number;
  brand?: string;
  condition: "new" | "used" | "refurbished" | "for_parts";
  stock: number;
  specs: Record<string, string>;
  tags: string[];
  popular: boolean;
  on_sale: boolean;
  // Classifieds
  posted_at?: string;
  views?: number;
  saves?: number;
  is_boosted?: boolean;
  is_featured?: boolean;
  negotiable?: boolean;
  contact_prefs?: string[];
  seller_id?: string;
  seller_name?: string;
  seller_avatar?: string;
  seller_phone?: string;
  seller_whatsapp?: string;
  seller_type?: "individual" | "dealer" | "brand";
  seller_verified?: boolean;
  seller_rating?: number;
  seller_reviews?: number;
  seller_joined_year?: number;
  seller_response_time_hours?: number;
  seller_response_rate?: number;
  seller_bio?: string;
  // FIXA service-provider extras (only used by services listings)
  provider_years_experience?: number;
  provider_jobs_completed?: number;
  provider_specializations?: string[];
  provider_service_areas?: string[];
  is_fixa_verified?: boolean;
  fixa_badges?: string[];
  /** FIXA: contact is hidden until the provider is unlocked with FIX (set by the backend on list payloads). */
  contact_locked?: boolean;
  /** Listing lifecycle (missing = active). */
  status?: ListingStatus;
  /** Only on /marketplace/my-listings — offers awaiting the seller. */
  open_offers?: number;
  sold_at?: string;
};

export type ListingStatus = "active" | "paused" | "sold" | "removed";

export type OfferStatus = "sent" | "countered" | "accepted" | "declined" | "withdrawn" | "superseded";

export type MarketOffer = {
  id: string;
  item_id: string;
  buyer_id: string;
  buyer_name?: string;
  seller_id?: string;
  amount: number;
  asking_price?: number;
  message?: string | null;
  counter_amount?: number | null;
  counter_message?: string | null;
  agreed_amount?: number | null;
  status: OfferStatus;
  conversation_id?: string | null;
  closed_reason?: string;
  created_at: string;
  updated_at?: string;
  item?: Pick<MarketplaceItem, "id" | "name" | "image" | "price" | "city" | "status" | "seller_id" | "seller_name"> | null;
};

export type MarketReportReason = "scam" | "prohibited" | "wrong_category" | "duplicate" | "offensive" | "other";

export type MarketReport = {
  id: string;
  item_id: string;
  seller_id?: string;
  reporter_id: string;
  reporter_name?: string;
  reason: MarketReportReason;
  details?: string | null;
  status: "OPEN" | "RESOLVED";
  resolution?: string;
  created_at: string;
  item?: MarketOffer["item"];
};

export type MarketCategory = {
  key: string;
  label: string;
  emoji: string;
  icon: string;
  color: string;
  count: number;
};

export type SellerProfile = {
  seller_id: string;
  seller_name?: string;
  seller_avatar?: string;
  seller_type: "individual" | "dealer" | "brand";
  seller_verified: boolean;
  seller_rating: number;
  seller_reviews: number;
  seller_joined_year: number;
  seller_response_time_hours: number;
  seller_response_rate: number;
  seller_bio?: string;
  seller_phone?: string;
  seller_whatsapp?: string;
  city?: string;
  listings_count: number;
  items_sold: number;
};

export type SearchSuggestions = {
  categories: string[];
  trending: string[];
  brands: string[];
  items: { id: string; name: string; image: string; price: number; city?: string }[];
};

export type Vendor = {
  id: string;
  name: string;
  tagline: string;
  logo: string;
  cover: string;
  verified: boolean;
  rating: number;
  reviews: number;
  followers: number;
  location: string;
  about: string;
  contact_phone: string;
  contact_email: string;
  joined_year: number;
};

export type Collection = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  banner: string;
  accent: string;
  tag_filter?: string;
  category_filter?: string;
};

export type AgentPublic = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string;
  agency_name?: string;
  office_address?: string;
  state: string;
  lga?: string;
  years_experience: number;
  areas_of_operation: string[];
  specialisations: string[];
  verification_level: 1 | 2 | 3;
  verification_badge: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  avatar_url?: string;
  rating: number;
  reviews_count: number;
  active_listings: number;
  total_sold: number;
  total_rented: number;
  mandate_verification_rate: number;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
};

export type CartLine = { item: MarketplaceItem; quantity: number };
export type Cart = { items: CartLine[]; subtotal: number };

export type Neighborhood = {
  id: string;
  name: string;
  city: string;
  state: string;
  image: string;
  avg_price: number;
  price_change_pct: number;
  walk_score: number;
  school_score: number;
  safety_score: number;
  infrastructure_score: number;
  overall_score: number;
  latitude: number;
  longitude: number;
  trending: boolean;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(AUTH_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Error carrying HTTP status + structured `detail` (e.g. {code:"UNLOCK_REQUIRED", fee, balance}). */
export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(message: string, status: number, detail?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Query-string builder — skips undefined/null/empty values. */
function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
    ...(await authHeaders()),
  };
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let detail: any = undefined;
    try {
      const j = await res.json();
      detail = j.detail;
      msg = typeof j.detail === "string" ? j.detail : j.detail?.message || j.detail?.error || msg;
    } catch {}
    const err = new ApiError(msg, res.status, detail);
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ─── Notification Center types ──────────────────────────────────────── */
export type NotifFrequency = "immediate" | "daily" | "weekly";
export type PushPromptStatus = "undetermined" | "granted" | "denied" | "dismissed" | "blocked";
export type NotifCategoryMeta = { label: string; caption: string; icon: string; digest: boolean; default_frequency: NotifFrequency };
export type AppNotification = {
  id: string;
  user_id: string;
  kind: string;
  category: string;
  title: string;
  body: string;
  read: boolean;
  meta: Record<string, any>;
  action_url?: string | null;
  created_at: string;
};
export type NotifCenterPage = {
  items: AppNotification[];
  unread: number;
  unread_by_category: Record<string, number>;
  categories: Record<string, NotifCategoryMeta>;
  next_before: string | null;
};
export type NotifPrefs = {
  user_id: string;
  categories: Record<string, { enabled: boolean; frequency: NotifFrequency }>;
  quiet_hours: { enabled: boolean; start: string; end: string };
  push_enabled: boolean;
  push_prompt: { status: PushPromptStatus; last_prompted_at: string | null; context: string | null };
  updated_at: string;
  catalog: Record<string, NotifCategoryMeta>;
  frequencies: NotifFrequency[];
};
export type NotifPrefsUpdate = {
  categories?: Record<string, { enabled?: boolean; frequency?: NotifFrequency }>;
  quiet_hours?: { enabled?: boolean; start?: string; end?: string };
  push_enabled?: boolean;
};

/* ─── Monetization types ─────────────────────────────────────────────── */
export type FeatureKey = "property" | "fixa_provider";
export type UnlockQuote = {
  feature_key: FeatureKey;
  target_id: string;
  label: string;
  category: string;
  zone_tier: "A" | "B" | "C" | "D";
  currency: "MASS" | "FIX";
  fee: number;
  fee_ngn: number;
  token_ngn: number;
  balance: number;
  balance_after: number;
  can_afford: boolean;
  already_unlocked: boolean;
  is_owner: boolean;
  available: boolean;
};
export type UnlockResult = {
  ok: boolean;
  feature_key: FeatureKey;
  target_id: string;
  charged: number;
  currency: "MASS" | "FIX";
  balance_after: number;
  free_reason?: string | null;
  entitlement?: { id: string; status: string; amount_paid: number; created_at: string } | null;
  details: any;
};
export type MapMarker = {
  id: string;
  category: "sale" | "rent";
  type?: string;
  lat: number;
  lng: number;
  unlocked: boolean;
  verified: boolean;
  approx: boolean;
  /** Friends (who share their saves) that saved this property — counts only, never names. */
  friends_saved: number;
  /** Sits in one of my shared lists. */
  in_shared_list: boolean;
  /** Active paid promotion tier (boost → gold pin). */
  promotion_tier?: PromotionTier | null;
};
export type ProviderPreview = {
  id: string;
  display_name: string;
  initials: string;
  category: string;
  rating?: number;
  reviews?: number;
  area?: string;
  verified: boolean;
  badges: string[];
  years_experience?: number;
  jobs_completed?: number;
  image?: string | null;
  is_boosted: boolean;
  tier?: number;
  unlocked?: boolean;
  bio?: string;
  zone_tier?: string;
};

export const api = {
  // ─── Monetization (shared unlock service) ───
  monetizationConfig: () =>
    req<{ conversion: { MASS_ngn: number; FIX_ngn: number }; welcome_bonus: { MASS: number; FIX: number }; topup_min_ngn: number; topup_bonus_tiers: { min_ngn: number; bonus_pct: number }[] }>("/monetization/config"),
  unlockQuote: (featureKey: FeatureKey, targetId: string) =>
    req<UnlockQuote>(`/unlocks/quote?featureKey=${featureKey}&targetId=${encodeURIComponent(targetId)}`),
  unlock: (featureKey: FeatureKey, targetId: string, idempotencyKey: string) =>
    req<UnlockResult>("/unlocks", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ featureKey, targetId }),
    }),
  unlockStatus: (key: string) => req<{ status: "pending" | "completed" | "failed"; result?: UnlockResult; error?: string }>(`/unlocks/status/${key}`),
  unlockCancel: (featureKey: FeatureKey, targetId: string, reason?: string) =>
    req<{ ok: boolean }>("/unlocks/cancel", { method: "POST", body: JSON.stringify({ featureKey, targetId, reason }) }),
  myUnlocks: (featureKey: FeatureKey) =>
    req<{ items: { entitlement: any; property?: Property; provider?: ProviderPreview & { phone?: string; whatsapp?: string } }[]; count: number }>(`/unlocks/mine?featureKey=${featureKey}`),
  reportUnlock: (entitlementId: string, reason: "unavailable" | "unreachable", note?: string) =>
    req<{ ok: boolean; credited: number; currency: string }>(`/unlocks/${entitlementId}/report`, { method: "POST", body: JSON.stringify({ reason, note }) }),
  propertyDetails: (id: string) => req<Property>(`/properties/${id}/details`),
  mapMarkers: (params?: Record<string, string | number | boolean | undefined>) => {
    const qs = params
      ? "?" +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return req<{ markers: MapMarker[]; count: number; approx_radius_m: number }>(`/map/markers${qs}`);
  },
  // FIXA (gated — FIX > 0)
  fixaAccess: () => req<{ allowed: boolean; balance: number; currency: "FIX" }>("/fixa/access"),
  fixaProviders: (params?: Record<string, string | number | boolean | undefined>) => {
    const qs = params
      ? "?" +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return req<{ items: ProviderPreview[]; count: number; subcategories: string[]; fix_balance: number }>(`/fixa/providers${qs}`);
  },
  fixaProvider: (id: string) => req<ProviderPreview>(`/fixa/providers/${id}`),
  fixaProviderDetails: (id: string) => req<any>(`/fixa/providers/${id}/details`),
  // Admin — pricing & monetization
  adminPricing: () => req<{ prices: any[]; conversion: any; zone_multipliers: any; bases: any }>("/admin/pricing"),
  adminSetPrice: (data: { featureKey: FeatureKey; category: string; zoneTier: string; amount: number; note?: string }) =>
    req<any>("/admin/pricing", { method: "POST", body: JSON.stringify(data) }),
  adminPricingHistory: (params?: Record<string, string | undefined>) => {
    const qs = params
      ? "?" + Object.entries(params).filter(([, v]) => !!v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
      : "";
    return req<{ history: any[] }>(`/admin/pricing/history${qs}`);
  },
  adminZones: () => req<{ zones: Record<string, string>; default: string }>("/admin/pricing/zones"),
  adminSetZones: (zones: Record<string, string>) => req<{ zones: Record<string, string> }>("/admin/pricing/zones", { method: "PUT", body: JSON.stringify({ zones }) }),
  adminTiers: () => req<{ tiers: Record<string, number>; bases: Record<string, number> }>("/admin/pricing/tiers"),
  adminSetTiers: (tiers: Record<string, number>) => req<{ tiers: Record<string, number> }>("/admin/pricing/tiers", { method: "PUT", body: JSON.stringify({ tiers }) }),
  adminMonetizationConfig: () => req<any>("/admin/monetization/config"),
  adminSetMonetizationConfig: (patch: any) => req<any>("/admin/monetization/config", { method: "PUT", body: JSON.stringify(patch) }),
  adminMonetizationReport: (params?: Record<string, string | undefined>) => {
    const qs = params
      ? "?" + Object.entries(params).filter(([, v]) => !!v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
      : "";
    return req<any>(`/admin/monetization/report${qs}`);
  },

  // Auth
  register: (data: { email: string; password: string; full_name: string; phone?: string }) =>
    req<{ access_token: string; user: UserProfile }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    req<{ access_token: string; user: UserProfile }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  appleSignIn: (data: { identity_token: string; full_name?: string; email?: string }) =>
    req<{ access_token: string; user: UserProfile }>("/auth/apple", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  googleSession: (session_id: string) =>
    req<{ access_token: string; user: UserProfile }>("/auth/google-session", {
      method: "POST",
      body: JSON.stringify({ session_id }),
    }),
  me: () => req<UserProfile>("/auth/me"),
  // ─── Phone OTP (primary mobile sign-in) ───
  phoneStart: (data: { phone?: string; dial_code?: string; number?: string; purpose?: "signin" | "link" | "change" }) =>
    req<PhoneStartOut>("/auth/phone/start", { method: "POST", body: JSON.stringify(data) }),
  phoneResend: (data: { phone: string; purpose?: "signin" | "link" | "change" }) =>
    req<PhoneStartOut>("/auth/phone/resend", { method: "POST", body: JSON.stringify(data) }),
  phoneVerify: (data: { phone: string; code: string; purpose?: "signin" | "link" | "change"; full_name?: string }) =>
    req<{ access_token?: string; user?: UserProfile; is_new?: boolean; ok?: boolean; changed?: boolean; phone_masked?: string }>("/auth/phone/verify", { method: "POST", body: JSON.stringify(data) }),
  phoneStatus: () => req<{ phone_masked?: string | null; verified: boolean; has_email_credential: boolean; provider: string; mocked: boolean }>("/auth/phone/status"),
  addEmailCredential: (email: string, password: string) => req<{ ok: boolean; email: string }>("/auth/account/add-email", { method: "POST", body: JSON.stringify({ email, password }) }),
  // ─── Analytics (funnel) ───
  analyticsIngest: (events: { name: string; props?: Record<string, string | number | boolean>; ts?: string; session_id?: string }[]) =>
    req<{ ok: boolean; accepted: number }>("/analytics/events", { method: "POST", body: JSON.stringify({ events }) }),
  adminFunnel: (days = 30) => req<AdminFunnel>(`/admin/analytics/funnel?days=${days}`),
  /** CSV export of the funnel (admin). Returns the raw text + server-suggested filename. */
  adminFunnelCsv: async (days = 30): Promise<{ text: string; filename: string }> => {
    const res = await fetch(`${BASE}/api/admin/analytics/funnel.csv?days=${days}`, { headers: await authHeaders() });
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    const cd = res.headers.get("content-disposition") ?? "";
    const m = /filename="([^"]+)"/.exec(cd);
    return { text: await res.text(), filename: m?.[1] ?? `amass-neighbours-funnel-${days}d.csv` };
  },
  // ─── Social: me / friends ───
  socialMe: () => req<SocialMe>("/social/me"),
  socialPatchMe: (patch: Partial<{ display_name: string; handle: string; bio: string; city: string; discoverable_by_contacts: boolean; discoverable_by_handle: boolean; share_saves: boolean }>) =>
    req<SocialMe>("/social/me", { method: "PATCH", body: JSON.stringify(patch) }),
  socialUser: (id: string) => req<PublicUser & { bio?: string | null; recognition: { points: number; badges: { key: string; label: string }[] }; connection: ConnectionState; shared_estates: { id: string; name: string }[]; is_me: boolean }>(`/social/users/${id}`),
  socialSearch: (q: string) => req<(PublicUser & { connection: ConnectionState })[]>(`/social/search?q=${encodeURIComponent(q)}`),
  socialContactsMatch: (hashes: string[]) => req<{ matches: (PublicUser & { connection: ConnectionState })[]; hashed: number; discoverable: boolean }>("/social/contacts/match", { method: "POST", body: JSON.stringify({ hashes }) }),
  socialContactsDisable: () => req<{ ok: boolean }>("/social/contacts/sync", { method: "DELETE" }),
  socialConnections: () => req<{ accepted: Connection[]; incoming: Connection[]; outgoing: Connection[] }>("/social/connections"),
  socialConnect: (user_id: string, message?: string) => req<{ ok: boolean; status: string; id: string }>("/social/connections", { method: "POST", body: JSON.stringify({ user_id, message }) }),
  socialRespondConnection: (id: string, action: "accept" | "decline" | "cancel" | "remove") => req<{ ok: boolean; status: string }>(`/social/connections/${id}/${action}`, { method: "POST" }),
  socialBlock: (user_id: string) => req<{ ok: boolean }>(`/social/block/${user_id}`, { method: "POST" }),
  socialUnblock: (user_id: string) => req<{ ok: boolean }>(`/social/block/${user_id}`, { method: "DELETE" }),
  socialMute: (user_id: string) => req<{ ok: boolean }>(`/social/mute/${user_id}`, { method: "POST" }),
  socialUnmute: (user_id: string) => req<{ ok: boolean }>(`/social/mute/${user_id}`, { method: "DELETE" }),
  socialBlocked: () => req<{ blocked: PublicUser[]; muted: PublicUser[] }>("/social/blocked"),
  socialReport: (data: { target_type: "user" | "post" | "reply" | "event" | "place" | "comment" | "collection"; target_id: string; reason: string; details?: string; estate_id?: string }) =>
    req<{ ok: boolean; report_id: string; duplicate?: boolean }>("/social/reports", { method: "POST", body: JSON.stringify(data) }),
  socialRecognition: () => req<{ points: number; badges: { key: string; label: string }[]; progress: { key: string; label: string; kind: string; have: number; need: number; earned: boolean }[]; recent: any[]; note: string }>("/social/recognition"),
  socialFeedback: (data: { area?: string; rating?: number; text: string }) => req<{ ok: boolean }>("/social/feedback", { method: "POST", body: JSON.stringify(data) }),
  socialContext: (ids: string[]) => req<PropertySocialContext>(`/social/context/properties?ids=${ids.join(",")}`),
  // ─── Shop (Brands → Lagos home-shopping) ───
  shopHome: () => req<ShopHome>("/shop/home"),
  shopRetailers: (params: { category?: string; filter?: string; q?: string } = {}) => req<{ retailers: ShopRetailer[]; total: number; area: string }>(`/shop/retailers${qs(params)}`),
  shopRetailer: (key: string) => req<ShopRetailerDetail>(`/shop/retailers/${encodeURIComponent(key)}`),
  shopRetailerProducts: (key: string, params: { category?: string; subcategory?: string; q?: string; sort?: string; deals?: boolean; in_stock?: boolean } = {}) =>
    req<{ retailer: ShopRetailerBrief; products: ShopProduct[]; total: number }>(`/shop/retailers/${encodeURIComponent(key)}/products${qs(params)}`),
  shopProducts: (params: { category?: string; q?: string; retailer?: string; brand?: string; sort?: string; deals?: boolean; in_stock?: boolean; limit?: number } = {}) =>
    req<{ products: ShopProduct[]; total: number; brands: string[]; retailers: ShopRetailerBrief[]; category: ShopCategory }>(`/shop/products${qs(params)}`),
  shopProduct: (id: string) => req<ShopProductDetail>(`/shop/products/${id}`),
  shopSearch: (q: string) => req<ShopSearchResult>(`/shop/search?q=${encodeURIComponent(q)}`),
  shopSuggest: (q: string) => req<{ suggestions: { kind: "store" | "category" | "brand" | "query"; label: string; slug?: string; key?: string }[] }>(`/shop/search/suggest?q=${encodeURIComponent(q)}`),
  shopContext: (ids: string[]) => req<Record<string, { friends_saved: number; saved_by: PublicUser[]; saved: boolean; in_basket_qty: number }>>(`/shop/context?ids=${ids.join(",")}`),
  shopToggleSave: (kind: "product" | "store", target_id: string) => req<{ saved: boolean }>("/shop/saves/toggle", { method: "POST", body: JSON.stringify({ kind, target_id }) }),
  shopSaves: () => req<{ products: ShopProduct[]; stores: ShopRetailer[] }>("/shop/saves"),
  shopBasket: () => req<ShopBasket>("/shop/basket"),
  shopBasketCount: () => req<{ count: number }>("/shop/basket/count"),
  shopBasketAdd: (product_id: string, qty = 1) => req<{ ok: boolean; qty: number; count: number; retailer_id: string }>("/shop/basket/items", { method: "POST", body: JSON.stringify({ product_id, qty }) }),
  shopBasketSetQty: (product_id: string, qty: number) => req<ShopBasket>(`/shop/basket/items/${product_id}`, { method: "PATCH", body: JSON.stringify({ qty }) }),
  shopBasketClearRetailer: (retailer_id: string) => req<ShopBasket>(`/shop/basket/retailer/${retailer_id}`, { method: "DELETE" }),
  shopHandoff: (retailer_id: string, route: "website" | "call" | "whatsapp", product_id?: string) =>
    req<{ ok: boolean; url: string; label: string; note: string }>(`/shop/basket/retailer/${retailer_id}/handoff`, { method: "POST", body: JSON.stringify({ route, product_id }) }),

  // ─── Social: collections ───
  collections: () => req<SharedCollection[]>("/social/collections"),
  collectionCreate: (data: { name: string; kind?: "homes" | "places" | "shopping"; emoji?: string; description?: string }) => req<SharedCollection>("/social/collections", { method: "POST", body: JSON.stringify(data) }),
  collection: (id: string) => req<CollectionDetail>(`/social/collections/${id}`),
  collectionPatch: (id: string, patch: { name?: string; emoji?: string; description?: string }) => req<{ ok: boolean }>(`/social/collections/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  collectionDelete: (id: string) => req<{ ok: boolean; deleted?: boolean; left?: boolean }>(`/social/collections/${id}`, { method: "DELETE" }),
  collectionAddItem: (id: string, data: { kind?: "property" | "place" | "product" | "store"; target_id: string; note?: string }) => req<{ ok: boolean; item_id: string; duplicate?: boolean }>(`/social/collections/${id}/items`, { method: "POST", body: JSON.stringify(data) }),
  collectionRemoveItem: (id: string, item_id: string) => req<{ ok: boolean }>(`/social/collections/${id}/items/${item_id}`, { method: "DELETE" }),
  collectionReact: (id: string, item_id: string, reaction: "love" | "maybe" | "no" | "clear") => req<{ ok: boolean }>(`/social/collections/${id}/items/${item_id}/react`, { method: "POST", body: JSON.stringify({ reaction }) }),
  collectionComment: (id: string, text: string, item_id?: string) => req<CollectionComment>(`/social/collections/${id}/comments`, { method: "POST", body: JSON.stringify({ text, item_id }) }),
  collectionInvite: (id: string, user_id: string) => req<{ ok: boolean; already_member?: boolean }>(`/social/collections/${id}/invite`, { method: "POST", body: JSON.stringify({ user_id }) }),
  collectionRotateCode: (id: string) => req<{ invite_code: string }>(`/social/collections/${id}/invite-code/rotate`, { method: "POST" }),
  collectionJoinPreview: (code: string) => req<{ id: string; name: string; emoji?: string | null; owner?: PublicUser | null; member_count: number; item_count: number; already_member: boolean }>(`/social/collections/join/${code}`),
  collectionJoin: (code: string) => req<{ ok: boolean; collection_id: string; already_member?: boolean }>(`/social/collections/join/${code}`, { method: "POST" }),
  collectionRemoveMember: (id: string, member_id: string) => req<{ ok: boolean }>(`/social/collections/${id}/members/${member_id}/remove`, { method: "POST" }),
  // ─── Community: estates ───
  neighboursHome: () => req<NeighboursHome>("/community/home"),
  estates: (params?: { q?: string; city?: string; lat?: number; lng?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.city) qs.set("city", params.city);
    if (params?.lat != null && params?.lng != null) {
      qs.set("lat", String(params.lat));
      qs.set("lng", String(params.lng));
    }
    const s = qs.toString();
    return req<{ items: Estate[]; my_estate_ids: string[] }>(`/community/estates${s ? `?${s}` : ""}`);
  },
  myEstates: () => req<Estate[]>("/community/estates/mine"),
  estate: (id: string) => req<Estate>(`/community/estates/${id}`),
  estateRequest: (data: { name: string; city: string; state?: string; area?: string; description?: string; latitude?: number; longitude?: number; i_am_manager?: boolean }) =>
    req<{ ok: boolean; estate_id: string; status: string; message: string }>("/community/estates/request", { method: "POST", body: JSON.stringify(data) }),
  estateJoin: (id: string, data: { join_code?: string; proof_url?: string; unit?: string; note?: string }) => req<{ ok: boolean; status: string; method?: string; message?: string; already_member?: boolean }>(`/community/estates/${id}/join`, { method: "POST", body: JSON.stringify(data) }),
  estateLeave: (id: string) => req<{ ok: boolean }>(`/community/estates/${id}/leave`, { method: "POST" }),
  estatePatch: (id: string, patch: { description?: string; cover_image?: string; amenities?: string[]; rules?: string; rotate_join_code?: boolean }) => req<{ ok: boolean; join_code?: string | null }>(`/community/estates/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  estateMembers: (id: string, status: "approved" | "pending" | "all" = "approved") => req<EstateMember[]>(`/community/estates/${id}/members?status=${status}`),
  estateMemberProof: (id: string, member_id: string) => req<{ proof_url: string; unit?: string | null }>(`/community/estates/${id}/members/${member_id}/proof`),
  estateReviewMember: (id: string, member_id: string, action: "approve" | "reject" | "make_manager" | "remove", note?: string) => req<{ ok: boolean }>(`/community/estates/${id}/members/${member_id}/review`, { method: "POST", body: JSON.stringify({ action, note }) }),
  estatePosts: (id: string, params?: { type?: string; group_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.group_id) qs.set("group_id", params.group_id);
    const s = qs.toString();
    return req<{ items: EstatePost[]; has_more: boolean }>(`/community/estates/${id}/posts${s ? `?${s}` : ""}`);
  },
  estatePostCreate: (id: string, data: { type: EstatePost["type"]; title?: string; body: string; group_id?: string; place_id?: string; tags?: string[]; official?: boolean }) => req<EstatePost>(`/community/estates/${id}/posts`, { method: "POST", body: JSON.stringify(data) }),
  post: (id: string) => req<EstatePost & { replies: PostReply[]; place?: Place | null }>(`/community/posts/${id}`),
  postReply: (id: string, body: string) => req<PostReply>(`/community/posts/${id}/replies`, { method: "POST", body: JSON.stringify({ body }) }),
  postAccept: (id: string, reply_id: string) => req<{ ok: boolean }>(`/community/posts/${id}/accept/${reply_id}`, { method: "POST" }),
  postUpvote: (id: string) => req<{ upvoted: boolean }>(`/community/posts/${id}/upvote`, { method: "POST" }),
  postModerate: (id: string, action: "hide" | "restore" | "pin" | "unpin" | "delete") => req<{ ok: boolean }>(`/community/posts/${id}/moderate?action=${action}`, { method: "POST" }),
  estateGroups: (id: string) => req<EstateGroup[]>(`/community/estates/${id}/groups`),
  estateGroupCreate: (id: string, data: { name: string; description?: string; emoji?: string }) => req<EstateGroup>(`/community/estates/${id}/groups`, { method: "POST", body: JSON.stringify(data) }),
  groupMembership: (group_id: string, action: "join" | "leave") => req<{ ok: boolean; joined: boolean }>(`/community/groups/${group_id}/${action}`, { method: "POST" }),
  // ─── Community: events / places / service requests ───
  events: (params?: { estate_id?: string; scope?: "upcoming" | "mine" | "past" }) => {
    const qs = new URLSearchParams();
    if (params?.estate_id) qs.set("estate_id", params.estate_id);
    if (params?.scope) qs.set("scope", params.scope);
    const s = qs.toString();
    return req<CommunityEvent[]>(`/community/events${s ? `?${s}` : ""}`);
  },
  eventCreate: (data: { title: string; description?: string; kind?: CommunityEvent["kind"]; starts_at: string; ends_at?: string; location_label: string; latitude?: number; longitude?: number; audience?: CommunityEvent["audience"]; estate_id?: string; property_id?: string; capacity?: number; group_chat?: boolean }) =>
    req<CommunityEvent>("/community/events", { method: "POST", body: JSON.stringify(data) }),
  event: (id: string) => req<CommunityEvent>(`/community/events/${id}`),
  eventRsvp: (id: string, status: "going" | "maybe" | "declined") => req<{ ok: boolean; status: string; conversation_id?: string | null }>(`/community/events/${id}/rsvp`, { method: "POST", body: JSON.stringify({ status }) }),
  eventCancel: (id: string) => req<{ ok: boolean }>(`/community/events/${id}/cancel`, { method: "POST" }),
  placesNearby: (params: { lat: number; lng: number; radius_km?: number; category?: string; estate_id?: string }) => {
    const qs = new URLSearchParams({ lat: String(params.lat), lng: String(params.lng) });
    if (params.radius_km) qs.set("radius_km", String(params.radius_km));
    if (params.category) qs.set("category", params.category);
    if (params.estate_id) qs.set("estate_id", params.estate_id);
    return req<{ items: Place[]; categories: string[] }>(`/community/places?${qs.toString()}`);
  },
  placeCreate: (data: { name: string; category: string; latitude: number; longitude: number; address_label?: string; estate_id?: string; is_amenity?: boolean; note?: string }) => req<{ ok: boolean; place_id: string; place?: Place; duplicate?: boolean }>("/community/places", { method: "POST", body: JSON.stringify(data) }),
  place: (id: string) => req<Place>(`/community/places/${id}`),
  placeRecommend: (id: string, text?: string) => req<{ ok: boolean; recommended: boolean }>(`/community/places/${id}/recommend`, { method: "POST", body: JSON.stringify({ text }) }),
  serviceRequests: (estate_id: string, scope: "mine" | "all" = "mine") => req<{ items: ServiceRequest[]; is_manager: boolean; categories: string[] }>(`/community/estates/${estate_id}/service-requests?scope=${scope}`),
  serviceRequestCreate: (data: { estate_id: string; category: string; title: string; description: string; location_label?: string; photos?: string[]; urgent?: boolean }) => req<ServiceRequest>("/community/service-requests", { method: "POST", body: JSON.stringify(data) }),
  serviceRequest: (id: string) => req<ServiceRequest>(`/community/service-requests/${id}`),
  serviceRequestUpdate: (id: string, data: { status: "acknowledged" | "in_progress" | "resolved" | "closed"; note?: string; fixa_item_id?: string }) => req<{ ok: boolean; status: string }>(`/community/service-requests/${id}/update`, { method: "POST", body: JSON.stringify(data) }),
  communityUpload: (data_url: string) => req<{ url: string; path: string }>("/community/uploads", { method: "POST", body: JSON.stringify({ data_url }) }),
  communityAlerts: () => req<{ join_requests: number; connection_requests: number; total: number }>("/community/alerts"),
  // ─── Admin: community ───
  adminSocialReports: (status: "OPEN" | "RESOLVED" | "ALL" = "OPEN") => req<{ items: SocialReport[]; open_total: number }>(`/social/admin/reports?status=${status}`),
  adminSocialResolve: (id: string, action: "dismiss" | "hide" | "restore" | "ban_user") => req<{ ok: boolean }>(`/social/admin/reports/${id}/resolve?action=${action}`, { method: "POST" }),
  adminEstates: (status: "pending" | "active" | "rejected" | "ALL" = "pending") => req<{ items: (Estate & { creator?: PublicUser | null; created_by?: string })[] }>(`/community/admin/estates?status=${status}`),
  adminReviewEstate: (id: string, action: "approve" | "reject") => req<{ ok: boolean }>(`/community/admin/estates/${id}/review?action=${action}`, { method: "POST" }),
  forgotPassword: (email: string) =>
    req<{ ok: boolean; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, code: string, new_password: string) =>
    req<{ ok: boolean; message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, code, new_password }),
    }),

  // Properties
  listProperties: (params?: Record<string, string | number | boolean | undefined>) => {
    const qs = params
      ? "?" +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "" && v !== null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return req<Property[]>(`/properties${qs}`);
  },
  getProperty: (id: string) => req<Property>(`/properties/${id}`),

  // Neighborhood Intelligence + heatmap + polygon (map v2)
  propertyIntelligence: (id: string) =>
    req<{
      property_id: string;
      neighborhood_name?: string;
      scores: { walk: number; school: number; safety: number; infra: number; lifestyle: number; rental_demand: number };
      price: { listed: number; per_sqm: number; area_avg: number; vs_area_pct: number; appreciation_yoy_pct: number };
      poi_km: { schools: number; hospitals: number; restaurants: number; supermarkets: number; fuel: number };
      commute: { downtown_km: number; downtown_min: number };
      signals: { views_30d: number; favorites_30d: number };
    }>(`/properties/${id}/intelligence`),
  mapHeatmap: (params: {
    min_lat?: number; max_lat?: number; min_lng?: number; max_lng?: number;
    metric?: "price_per_sqm" | "verified_density" | "views";
    cells?: number;
  }) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return req<{ cells: { lat: number; lng: number; count: number; weight: number }[]; metric: string }>(
      `/map/heatmap${qs ? `?${qs}` : ""}`
    );
  },
  mapPolygonSearch: (vertices: { latitude: number; longitude: number }[]) => {
    const coords = vertices.map((v) => `${v.latitude},${v.longitude}`).join(";");
    return req<Property[]>(`/map/polygon-search?coords=${encodeURIComponent(coords)}`);
  },

  // Favorites
  toggleFavorite: (property_id: string) =>
    req<{ favorited: boolean }>(`/favorites/toggle`, {
      method: "POST",
      body: JSON.stringify({ property_id }),
    }),
  favoriteIds: () => req<{ ids: string[] }>("/favorites/ids"),
  listFavorites: () => req<Property[]>("/favorites"),

  // Marketplace
  marketplace: (params?: Record<string, string | number | boolean | undefined>) => {
    const qs = params
      ? "?" +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "" && v !== null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return req<MarketplaceItem[]>(`/marketplace${qs}`);
  },
  marketplaceItem: (id: string) =>
    req<{ item: MarketplaceItem; related: MarketplaceItem[] }>(`/marketplace/items/${id}`),
  marketplaceCollections: () => req<Collection[]>("/marketplace/collections"),
  marketplaceVendors: () => req<Vendor[]>("/marketplace/vendors"),
  marketplaceVendor: (id: string) =>
    req<{ vendor: Vendor; items: MarketplaceItem[] }>(`/marketplace/vendors/${id}`),
  marketplaceRecordView: (id: string) =>
    req<{ ok: boolean }>(`/marketplace/items/${id}/view`, { method: "POST" }),
  marketplaceRecentlyViewed: () => req<MarketplaceItem[]>("/marketplace/recently-viewed"),

  // Marketplace v2 — classifieds
  marketplaceCategories: () => req<MarketCategory[]>("/marketplace/categories"),
  marketplaceTrending: () =>
    req<{ searches: string[]; brands: string[] }>("/marketplace/trending"),
  marketplaceSuggestions: (q: string) =>
    req<SearchSuggestions>(`/marketplace/search/suggestions?q=${encodeURIComponent(q)}`),
  marketplaceToggleSave: (id: string) =>
    req<{ saved: boolean }>(`/marketplace/items/${id}/save`, { method: "POST" }),
  marketplaceSavedIds: () => req<{ ids: string[] }>("/marketplace/saved/ids"),
  marketplaceSaved: () => req<MarketplaceItem[]>("/marketplace/saved"),
  marketplaceMakeOffer: (id: string, amount: number, message?: string) =>
    req<{ ok: boolean; offer: any }>(`/marketplace/items/${id}/offer`, {
      method: "POST",
      body: JSON.stringify({ amount, message }),
    }),
  marketplaceOffersSent: () => req<MarketOffer[]>("/marketplace/offers/sent"),
  marketplaceOffersReceived: () => req<MarketOffer[]>("/marketplace/offers/received"),
  marketplaceRespondOffer: (id: string, action: "accept" | "decline" | "counter", counter_amount?: number, message?: string) =>
    req<{ ok: boolean; offer: MarketOffer }>(`/marketplace/offers/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ action, counter_amount, message }),
    }),
  marketplaceWithdrawOffer: (id: string) =>
    req<{ ok: boolean; offer: MarketOffer }>(`/marketplace/offers/${id}/withdraw`, { method: "POST" }),
  marketplaceUpdateListing: (id: string, patch: { name?: string; description?: string; price?: number; negotiable?: boolean; status?: "active" | "paused" | "sold" }) =>
    req<{ ok: boolean; item: MarketplaceItem }>(`/marketplace/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  marketplaceDeleteListing: (id: string) => req<{ ok: boolean }>(`/marketplace/items/${id}`, { method: "DELETE" }),
  marketplaceReport: (id: string, reason: MarketReportReason, details?: string) =>
    req<{ ok: boolean; report_id: string; duplicate?: boolean; auto_paused?: boolean }>(`/marketplace/items/${id}/report`, {
      method: "POST",
      body: JSON.stringify({ reason, details }),
    }),
  adminMarketReports: (status: "OPEN" | "RESOLVED" | "ALL" = "OPEN", limit = 100) =>
    req<{ items: MarketReport[]; count: number; open_total: number }>(`/marketplace/admin/reports?status=${status}&limit=${limit}`),
  adminResolveMarketReport: (id: string, action: "dismiss" | "remove_listing" | "pause_listing" | "restore_listing", note?: string) =>
    req<{ ok: boolean; action: string }>(`/marketplace/admin/reports/${id}/resolve`, { method: "POST", body: JSON.stringify({ action, note }) }),
  chatStartFromItem: (item_id: string) => req<any>(`/chat/conversations/from-item/${item_id}`, { method: "POST" }),
  /** Direct 1:1 chat — only between accepted connections (enforced server-side). */
  chatStartDirect: (user_id: string) => req<any>(`/chat/conversations/direct/${user_id}`, { method: "POST" }),
  marketplaceCreateListing: (data: {
    name: string;
    description: string;
    price: number;
    category: string;
    subcategory: string;
    condition: string;
    brand?: string;
    image: string;
    images: string[];
    city?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    negotiable?: boolean;
    contact_prefs?: string[];
    seller_phone?: string;
    seller_whatsapp?: string;
    specs?: Record<string, string>;
    tags?: string[];
  }) =>
    req<{ ok: boolean; item: MarketplaceItem }>("/marketplace/items", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  marketplaceMyListings: () => req<MarketplaceItem[]>("/marketplace/my-listings"),
  marketplaceSeller: (id: string) =>
    req<{ profile: SellerProfile; items: MarketplaceItem[] }>(`/marketplace/sellers/${id}`),

  // FIXA Services — booking a verified provider
  fixaBook: (data: {
    item_id: string;
    customer_name: string;
    customer_phone: string;
    address: string;
    scheduled_date: string;
    scheduled_time: string;
    notes?: string;
  }) =>
    req<{ ok: boolean; booking: any }>("/marketplace/fixa/book", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  fixaMyBookings: () => req<any[]>("/marketplace/fixa/bookings"),

  // Cart
  getCart: () => req<Cart>("/cart"),
  cartAdd: (item_id: string, quantity: number = 1) =>
    req<Cart>("/cart/add", { method: "POST", body: JSON.stringify({ item_id, quantity }) }),
  cartUpdate: (item_id: string, quantity: number) =>
    req<Cart>("/cart/update", { method: "POST", body: JSON.stringify({ item_id, quantity }) }),
  cartRemove: (item_id: string) => req<Cart>(`/cart/${item_id}`, { method: "DELETE" }),
  cartClear: () => req<Cart>("/cart/clear", { method: "POST" }),
  checkout: () => req<{ order_id: string; subtotal: number; eta_days: number }>("/checkout", { method: "POST" }),

  // Neighborhoods
  neighborhoods: () => req<Neighborhood[]>("/neighborhoods"),

  // Agent
  createProperty: (data: {
    title: string;
    description: string;
    price: number;
    listing_type: string;
    property_type: string;
    bedrooms: number;
    bathrooms: number;
    size_sqm: number;
    location: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
    images: string[];
    amenities: string[];
    year_built?: number;
    parking?: number;
    is_owner?: boolean;
    has_mandate?: boolean;
    mandate?: {
      owner_name: string;
      owner_phone: string;
      mandate_type: "exclusive" | "sole" | "open" | "verbal";
      mandate_expiry?: string;
      documents?: string[];
    };
  }) =>
    req<Property>("/properties", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  agentApply: (data: {
    full_name: string;
    phone: string;
    email: string;
    nin?: string;
    id_document_url?: string;
    selfie_url?: string;
    agency_name?: string;
    cac_number?: string;
    office_address?: string;
    state: string;
    lga?: string;
    years_experience: number;
    areas_of_operation: string[];
    specialisations: string[];
    has_mandate_authority: boolean;
  }) =>
    req<AgentPublic>("/agents/apply", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  agentMe: () => req<AgentPublic>("/agents/me"),
  agentPublic: (user_id: string) => req<AgentPublic>(`/agents/${user_id}`),
  agentPublicListings: (user_id: string) => req<Property[]>(`/agents/${user_id}/listings`),
  agentDashboard: () =>
    req<{
      stats: {
        listings: number;
        active: number;
        verified: number;
        views_30d: number;
        favorites_30d: number;
        total_value: number;
      };
      recent: Property[];
    }>("/agent/dashboard"),
  agentListings: () => req<Property[]>("/agent/listings"),
  agentListingsAnalytics: () =>
    req<
      {
        property_id: string;
        title: string;
        image: string;
        price: number;
        status: string;
        verified: boolean;
        views: number;
        favorites: number;
      }[]
    >("/agent/listings-analytics"),
  recordView: (property_id: string) =>
    req<{ ok: boolean }>(`/properties/${property_id}/view`, { method: "POST" }),
  agentLeads: () =>
    req<
      {
        id: string;
        name: string;
        avatar: string;
        channel: "chat" | "call" | "email";
        message: string;
        property_id: string;
        property_title: string;
        property_image: string;
        created_at: string;
        unread: boolean;
      }[]
    >("/agent/leads"),

  // AI
  aiSearchSync: (query: string, session_id?: string) =>
    req<{ reply: string }>("/ai/search/sync", {
      method: "POST",
      body: JSON.stringify({ query, session_id }),
    }),

  // ─── Token economy (MASS = property utility) ─────────
  wallet: () => req<WalletDto>("/wallet/me"),
  walletDual: () => req<DualWalletDto>("/wallet/dual"),
  walletMass: () => req<WalletDto>("/wallet/mass"),
  walletTransactions: (limit = 40, currency?: Currency) =>
    req<WalletTransaction[]>(
      `/wallet/transactions?limit=${limit}${currency ? `&currency=${currency}` : ""}`
    ),
  walletUnlocks: () =>
    req<
      {
        id: string;
        user_id: string;
        property_id: string;
        tokens_paid: number;
        expires_at: string | null;
        created_at: string;
        property?: {
          id: string;
          title: string;
          images: string[];
          location: string;
          price: number;
        };
      }[]
    >("/wallet/unlocks"),
  listBundles: (currency: Currency = "MASS") =>
    req<TokenBundle[]>(`/tokens/bundles?currency=${currency}`),
  purchaseTokens: (bundle_id: string, provider: "paystack" | "flutterwave" | "bank_transfer" | "card" | "mock" = "mock") =>
    req<{ ok: boolean; credited: number; balance: number }>("/tokens/purchase", {
      method: "POST",
      body: JSON.stringify({ bundle_id, provider }),
    }),
  listPlans: () => req<SubscriptionPlan[]>("/subscriptions/plans"),
  myTokenSubscription: () => req<any>("/subscriptions/me"),
  subscribe: (plan_id: string, provider: "paystack" | "flutterwave" | "bank_transfer" | "card" | "mock" = "mock") =>
    req<{ ok: boolean; subscription: any; credited: number; balance: number }>(
      "/subscriptions/subscribe",
      { method: "POST", body: JSON.stringify({ plan_id, provider }) }
    ),
  cancelTokenSubscription: () =>
    req<{ ok: boolean; cancelled: number }>("/subscriptions/cancel", { method: "POST" }),
  unlockProperty: (property_id: string) =>
    req<{
      ok: boolean;
      already_unlocked?: boolean;
      free?: boolean;
      unlock: any;
      tokens_paid?: number;
      balance?: number;
    }>("/properties/unlock", { method: "POST", body: JSON.stringify({ property_id }) }),

  // ─── Two-tier property access (access fee + agent-contact fee) ───
  propertyAccessInfo: (property_id: string) =>
    req<{
      property_id: string;
      is_free: boolean;
      currency: Currency;
      access_period_days: number;
      balance: number;
      access: { unlocked: boolean; fee: number };
      agent_contact: { unlocked: boolean; fee: number; available: boolean };
    }>(`/properties/${encodeURIComponent(property_id)}/access-info`),
  accessProperty: (property_id: string) =>
    req<{
      ok: boolean;
      tier: string;
      free?: boolean;
      already_unlocked?: boolean;
      tokens_paid: number;
      balance?: number;
    }>(`/properties/${encodeURIComponent(property_id)}/access`, { method: "POST" }),
  revealAgentContact: (property_id: string) =>
    req<{
      ok: boolean;
      tier: string;
      already_unlocked?: boolean;
      tokens_paid: number;
      balance?: number;
      contact: { name?: string; phone?: string; email?: string } | null;
    }>(`/properties/${encodeURIComponent(property_id)}/reveal-agent`, { method: "POST" }),
  settingsPricing: () =>
    req<{
      property_access_fee: number;
      agent_contact_fee: number;
      access_period_days: number;
      currency: Currency;
      privacy_policy_url: string;
      free_amass_sale: boolean;
    }>("/settings/pricing"),
  adminWalletTransactions: (params: { user_id?: string; kind?: string; currency?: string; limit?: number } = {}) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "" && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return req<{ items: (WalletTransaction & { user_email?: string; user_name?: string })[]; count: number }>(
      `/admin/wallet/transactions${qs ? `?${qs}` : ""}`
    );
  },
  adminWalletAdjust: (user_id: string, amount: number, reason: string, currency: Currency = "MASS") =>
    req<{ ok: boolean; user_id: string; currency: Currency; amount: number; balance: number }>(
      `/admin/wallet/${encodeURIComponent(user_id)}/adjust`,
      { method: "POST", body: JSON.stringify({ amount, reason, currency }) }
    ),
  earnDailyLogin: () =>
    req<{ ok: boolean; credited?: number; reason?: string }>(
      "/wallet/earn?task_id=daily_login",
      { method: "POST" }
    ),

  // ─── FIX token (FIXA service utility & reward) ────────
  walletFix: () => req<WalletDto>("/wallet/fix"),
  listFixBundles: () => req<TokenBundle[]>("/wallet/fix/bundles"),
  fixEarnRules: () => req<FixEarnRule[]>("/wallet/fix/earn-rules"),
  fixSpendRules: () => req<FixSpendRule[]>("/wallet/fix/spend-rules"),
  purchaseFix: (bundle_id: string, provider: "paystack" | "flutterwave" | "bank_transfer" | "card" | "mock" = "mock") =>
    req<{ ok: boolean; credited: number; balance: number }>("/wallet/fix/purchase", {
      method: "POST",
      body: JSON.stringify({ bundle_id, provider }),
    }),
  spendFix: (action: string, meta?: Record<string, any>) =>
    req<{ ok: boolean; action: string; spent: number; balance: number }>(
      "/wallet/fix/spend",
      { method: "POST", body: JSON.stringify({ action, meta: meta || {} }) }
    ),
  earnFix: (event: string, meta?: Record<string, any>) =>
    req<{ ok: boolean; credited?: number; balance?: number; duplicate?: boolean }>(
      "/wallet/fix/earn",
      { method: "POST", body: JSON.stringify({ event, meta: meta || {} }) }
    ),
  fixaCompleteBooking: (booking_id: string, rating?: number, review?: string) =>
    req<{ ok: boolean; already_completed?: boolean; awards?: { event: string; amount: number }[] }>(
      `/marketplace/fixa/bookings/${booking_id}/complete`,
      { method: "POST", body: JSON.stringify({ rating, review }) }
    ),

  // ─── Saved Searches / Alerts ─────────────────────────────
  savedSearches: () =>
    req<Array<{
      id: string;
      name: string;
      criteria: any;
      alerts_enabled: boolean;
      new_matches_since_seen: number;
      last_run_at: string | null;
      created_at: string;
    }>>("/saved-searches"),
  createSavedSearch: (name: string, criteria: Record<string, any>, alerts_enabled = true) =>
    req<any>("/saved-searches", {
      method: "POST",
      body: JSON.stringify({ name, criteria, alerts_enabled }),
    }),
  deleteSavedSearch: (id: string) =>
    req<{ ok: boolean }>(`/saved-searches/${id}`, { method: "DELETE" }),
  toggleSavedSearchAlerts: (id: string, enabled: boolean) =>
    req<{ ok: boolean; alerts_enabled: boolean }>(
      `/saved-searches/${id}/alerts`,
      { method: "PATCH", body: JSON.stringify({ enabled }) }
    ),
  runSavedSearch: (id: string) =>
    req<{ count: number; matches: any[] }>(`/saved-searches/${id}/run`, {
      method: "POST",
    }),

  // ─── Real payments (Paystack / Flutterwave, with MOCK fallback) ─
  initPayment: (
    provider: "paystack" | "flutterwave",
    currency: Currency,
    bundle_id: string
  ) =>
    req<{ reference: string; checkout_url: string; mock: boolean }>(
      "/payments/initialize",
      {
        method: "POST",
        body: JSON.stringify({ provider, currency, bundle_id }),
      }
    ),
  paymentStatus: (reference: string) =>
    req<{
      reference: string;
      status: string;
      bundle_name: string;
      currency: Currency;
      credits: number;
      bonus: number;
      amount_ngn: number;
    }>(`/payments/status/${reference}`),

  // ─── Property Improvement · Inspection · Finance · Projects ───
  improveCatalog: () =>
    req<{
      milestones: { key: string; label: string; icon: string }[];
      finance_products: { id: string; name: string; description: string }[];
      partner_banks: {
        id: string; name: string; products: string[];
        rate_apr_range: [number, number]; max_tenor_months: number;
      }[];
      trades: string[];
      brand_categories: string[];
    }>("/improve/catalog"),
  improveMine: () =>
    req<{
      inspections: any[];
      finance_applications: any[];
      projects: any[];
    }>("/improve/mine"),
  improveProperty: (propertyId: string) =>
    req<{
      property: any;
      inspections: any[];
      finance_applications: any[];
      projects: any[];
      summary: {
        current_market_value_ngn?: number;
        estimated_renovation_cost_ngn?: number;
        estimated_post_renovation_value_ngn?: number;
        estimated_rental_income_monthly_ngn?: number;
        property_health_score?: number;
        active_project_id?: string;
        financing_status?: string;
      };
    }>(`/improve/property/${propertyId}`),
  createInspection: (data: {
    property_id: string;
    renovation_goals: string;
    budget_hint_ngn?: number;
    preferred_date?: string;
    contact_phone: string;
    photos?: string[];
    videos?: string[];
    notes?: string;
  }) =>
    req<any>("/inspections", { method: "POST", body: JSON.stringify(data) }),
  getInspection: (id: string) => req<any>(`/inspections/${id}`),
  myInspections: () => req<any[]>("/inspections/mine"),
  createFinanceApplication: (data: {
    property_id: string;
    inspection_id?: string;
    product_id: string;
    partner_bank_id?: string;
    amount_requested_ngn: number;
    tenor_months: number;
    purpose: string;
    documents?: any[];
    contact_phone?: string;
  }) =>
    req<any>("/finance/applications", { method: "POST", body: JSON.stringify(data) }),
  getFinanceApplication: (id: string) => req<any>(`/finance/applications/${id}`),
  createProject: (data: {
    property_id: string;
    inspection_id?: string;
    finance_application_id?: string;
    scope: string;
    estimated_cost_ngn?: number;
    estimated_completion?: string;
    boq_items?: any[];
    recommended_provider_ids?: string[];
    recommended_brand_ids?: string[];
  }) =>
    req<any>("/projects", { method: "POST", body: JSON.stringify(data) }),
  getProject: (id: string) => req<any>(`/projects/${id}`),
  advanceMilestone: (project_id: string, milestone_key: string, note?: string) =>
    req<{ ok: boolean; milestones_completed: Record<string, string> }>(
      `/projects/${project_id}/milestone`,
      { method: "PATCH", body: JSON.stringify({ milestone_key, note }) }
    ),
  notifications: () =>
    req<{ unread: number; items: any[] }>("/notifications"),
  markNotificationsRead: () =>
    req<{ ok: boolean }>("/notifications/mark-read", { method: "POST" }),

  /** Public — real verified listing photos for the welcome collage (no auth). */
  welcomePhotos: (limit = 3) => req<{ items: { property_id: string; image: string; label: string; title: string }[]; cached: boolean }>(`/public/welcome-photos?limit=${limit}`),

  // ─── Notification Center (user-controlled categories / frequency / quiet hours / push) ───
  notifCenter: (params: { category?: string; before?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.category && params.category !== "all") q.set("category", params.category);
    if (params.before) q.set("before", params.before);
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return req<NotifCenterPage>(`/notifications/center${qs ? `?${qs}` : ""}`);
  },
  notifUnreadCount: () => req<{ unread: number }>("/notifications/unread-count"),
  notifPrefs: () => req<NotifPrefs>("/notifications/prefs"),
  updateNotifPrefs: (body: NotifPrefsUpdate) =>
    req<NotifPrefs>("/notifications/prefs", { method: "PUT", body: JSON.stringify(body) }),
  notifPushPrompt: (status: PushPromptStatus, context?: string) =>
    req<{ ok: boolean; push_prompt: NotifPrefs["push_prompt"]; push_enabled: boolean }>("/notifications/push-prompt", {
      method: "POST",
      body: JSON.stringify({ status, context }),
    }),
  markNotifRead: (id: string) => req<{ ok: boolean; unread: number }>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  markNotifReadByTarget: (target_type: string, target_id: string) =>
    req<{ ok: boolean; marked: number; unread: number }>("/notifications/read-by-target", {
      method: "POST",
      body: JSON.stringify({ target_type, target_id }),
    }),
  markNotifReadAll: (category?: string) =>
    req<{ ok: boolean; marked: number; unread: number }>(`/notifications/read-all${category && category !== "all" ? `?category=${encodeURIComponent(category)}` : ""}`, { method: "POST" }),
  notifPreview: () => req<{ ok: boolean; notification: AppNotification }>("/notifications/preview", { method: "POST" }),
  createAgentReferral: (data: {
    property_id: string;
    client_user_id?: string;
    client_name?: string;
    client_phone?: string;
    note?: string;
    product_id?: string;
  }) =>
    req<any>("/agent-workspace/referrals", { method: "POST", body: JSON.stringify(data) }),
  myAgentReferrals: () => req<any[]>("/agent-workspace/referrals"),
  qualifyReferral: (referral_id: string, application_id: string, deal_value_ngn: number) =>
    req<{ ok: boolean; commission_amount_ngn: number; rate: number }>(
      `/agent-workspace/referrals/${referral_id}/qualify`,
      { method: "POST", body: JSON.stringify({ application_id, deal_value_ngn }) }
    ),
  payoutReferral: (
    referral_id: string,
    method: "bank" | "wallet",
    bank_account?: { bank_name: string; account_number: string; account_name: string }
  ) =>
    req<{
      ok: boolean;
      already_paid?: boolean;
      amount_ngn?: number;
      reference?: string;
      method?: string;
      credited_mass?: number;
    }>(`/agent-workspace/referrals/${referral_id}/payout`, {
      method: "POST",
      body: JSON.stringify({ method, bank_account }),
    }),
  agentSummary: () =>
    req<{
      total_referrals: number;
      approved_count: number;
      paid_count: number;
      pending_payout_ngn: number;
      paid_ngn: number;
    }>("/agent-workspace/summary"),

  // ─── Earn / Referrals ─────────────────────────────────
  earnTasks: () =>
    req<{
      tasks: {
        id: string;
        label: string;
        tokens: number;
        icon: string;
        one_time: boolean;
        completed: boolean;
        claimable_today: boolean;
      }[];
      streak: number;
    }>("/earn/tasks"),
  claimTask: (task_id: string) =>
    req<{ ok: boolean; credited?: number; reason?: string; task_id?: string }>(
      "/earn/claim",
      { method: "POST", body: JSON.stringify({ task_id }) }
    ),
  phoneVerifyStart: (phone: string) =>
    req<{ ok: boolean; mocked?: boolean; hint?: string }>(
      "/earn/phone/start",
      { method: "POST", body: JSON.stringify({ phone }) }
    ),
  phoneVerifyConfirm: (phone: string, code: string) =>
    req<{ ok: boolean; reward?: any }>(
      "/earn/phone/confirm",
      { method: "POST", body: JSON.stringify({ phone, code }) }
    ),
  completeProfile: (payload: {
    full_name?: string;
    phone?: string;
    city?: string;
    bio?: string;
    avatar_url?: string;
  }) =>
    req<{ ok: boolean; reward?: any; filled: number; needed?: number }>(
      "/earn/profile",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  myReferral: () =>
    req<{
      code: string;
      share_url: string;
      referred_count: number;
      tokens_per_referral: number;
    }>("/earn/referral/me"),
  applyReferral: (code: string) =>
    req<{ ok: boolean; you_get: number; referrer_gets: number }>(
      "/earn/referral/apply",
      { method: "POST", body: JSON.stringify({ code }) }
    ),

  // ─── Agent tools ──────────────────────────────────────
  promotionsConfig: () => req<Record<PromotionTier, PromotionTierConfig>>("/agent/promotions/config"),
  promotionPreview: (property_id: string) => req<PromotionPreview>(`/agent/promotions/preview/${encodeURIComponent(property_id)}`),
  promoteListing: (property_id: string, tier: PromotionTier) =>
    req<{ ok: boolean; tier: PromotionTier; starts_at: string; expires_at: string; cost: number; extended: boolean; alerts_sent: number; balance_after: number }>(
      "/agent/promote",
      { method: "POST", body: JSON.stringify({ property_id, tier }) }
    ),
  myPromotions: () =>
    req<{
      active: (PromotionPreview["property"] & { promotion: PromotionInfo; views_since: number; saves_since: number })[];
      history: { id: string; property_id: string; tier: PromotionTier; cost: number; days: number; starts_at: string; expires_at: string; extended: boolean; alerts_sent: number; created_at: string }[];
      tiers: Record<PromotionTier, PromotionTierConfig>;
      spent_total: number;
    }>("/agent/promotions/mine"),
  adminPromotionConfig: () => req<{ tiers: Record<PromotionTier, PromotionTierConfig>; defaults: Record<PromotionTier, PromotionTierConfig> }>("/admin/promotions/config"),
  adminSetPromotionConfig: (patch: Partial<Record<PromotionTier, { tokens?: number; days?: number }>>) =>
    req<{ tiers: Record<PromotionTier, PromotionTierConfig> }>("/admin/promotions/config", { method: "PATCH", body: JSON.stringify(patch) }),
  listLeads: (property_id: string) =>
    req<{
      leads: {
        favorite_user_id: string;
        name: string;
        avatar_url?: string;
        phone?: string;
        email?: string;
        unlocked: boolean;
        cost: number;
        saved_at: string;
      }[];
      unlock_cost: number;
    }>(`/agent/leads/${property_id}`),
  unlockLead: (property_id: string, favorite_user_id: string) =>
    req<{ ok: boolean; cost: number; contact: { name: string; phone: string; email: string } }>(
      "/agent/leads/unlock",
      { method: "POST", body: JSON.stringify({ property_id, favorite_user_id }) }
    ),
  aiDescription: (params: {
    title: string;
    property_type?: string;
    bedrooms?: number;
    bathrooms?: number;
    size_sqm?: number;
    location?: string;
    amenities?: string[];
    tone?: "luxurious" | "family" | "investor" | "concise";
  }) =>
    req<{ description: string; cost: number }>("/agent/ai/description", {
      method: "POST",
      body: JSON.stringify(params),
    }),
  aiParseSearch: (query: string) =>
    req<{
      ok: boolean;
      filters?: {
        listing_type?: string;
        property_type?: string;
        min_price?: number;
        max_price?: number;
        bedrooms?: number;
        city?: string;
        verified?: boolean;
        keywords?: string[];
        summary?: string;
      };
      error?: string;
    }>("/agent/ai/parse-search", { method: "POST", body: JSON.stringify({ query }) }),

  // ─── Ads ──────────────────────────────────────────────
  adTiers: () =>
    req<Record<string, { tokens: number; days: number; label: string; perk: string }>>(
      "/ads/tiers"
    ),
  nextAd: (context = "marketplace_home", exclude: string[] = []) =>
    req<{ ad: any | null; reason?: string }>(
      `/ads/next?context=${encodeURIComponent(context)}${
        exclude.length ? `&exclude=${exclude.join(",")}` : ""
      }`
    ),
  trackAd: (
    ad_id: string,
    event: "impression" | "click" | "save" | "chat" | "call" | "dismiss" | "not_interested" | "hide_similar" | "report",
    context?: string
  ) =>
    req<{ ok: boolean }>("/ads/track", {
      method: "POST",
      body: JSON.stringify({ ad_id, event, context }),
    }),
  myAds: () => req<any[]>("/ads/mine"),
  createAd: (payload: any) =>
    req<any>("/ads", { method: "POST", body: JSON.stringify(payload) }),

  // Phase C/D/E — Ads advanced
  pauseAd: (ad_id: string) =>
    req<{ ok: boolean; status: string }>(
      `/ads/${encodeURIComponent(ad_id)}/pause`,
      { method: "POST" }
    ),
  resumeAd: (ad_id: string) =>
    req<{ ok: boolean; status: string }>(
      `/ads/${encodeURIComponent(ad_id)}/resume`,
      { method: "POST" }
    ),
  cancelAd: (ad_id: string) =>
    req<{ ok: boolean; refund_tokens: number }>(
      `/ads/${encodeURIComponent(ad_id)}/cancel`,
      { method: "POST" }
    ),
  adAnalytics: (ad_id: string, period_days = 7) =>
    req<{
      ad_id: string;
      title: string;
      status: string;
      tier: string;
      period_days: number;
      funnel: {
        impressions: number;
        clicks: number;
        saves: number;
        chats: number;
        calls: number;
      };
      ctr_percent: number;
      spent_tokens: number;
      cost_per_action: {
        cpm_tokens: number;
        cpc_tokens: number;
        cost_per_chat_tokens: number;
      };
      budget: {
        daily_budget_tokens?: number | null;
        daily_spent_tokens: number;
        total_budget_tokens?: number | null;
        total_spent_tokens: number;
      };
      impressions_over_time: { day: string; hour: number; count: number }[];
      clicks_over_time: { day: string; hour: number; count: number }[];
    }>(`/ads/${encodeURIComponent(ad_id)}/analytics?period_days=${period_days}`),
  adSuggestions: (ad_id: string) =>
    req<{
      ad_id: string;
      used_ai: boolean;
      cost_charged_tokens: number;
      suggestions: {
        kind: string;
        priority: "high" | "medium" | "low";
        text: string;
      }[];
    }>(`/ads/${encodeURIComponent(ad_id)}/suggestions`),
  myInterestTags: () => req<{ tags: string[] }>("/ads/interest-tags/mine"),

  // ─── D-1: Property Types + App Settings ───
  propertyTypes: () =>
    req<
      {
        id: string;
        slug: string;
        label: string;
        icon: string;
        color: string;
        order: number;
        subtypes: string[];
        active: boolean;
        is_system?: boolean;
      }[]
    >("/property-types"),
  featureFlags: () => req<Record<string, boolean>>("/settings/feature-flags"),
  adminListSettings: () => req<Record<string, any>>("/admin/settings"),
  adminGetSetting: (key: string) => req<{ key: string; value: any }>(`/admin/settings/${encodeURIComponent(key)}`),
  adminPatchSetting: (key: string, value: any) =>
    req<{ ok: boolean; key: string; value: any }>(
      `/admin/settings/${encodeURIComponent(key)}`,
      { method: "PATCH", body: JSON.stringify({ value }) }
    ),
  adminResetSetting: (key: string) =>
    req<{ ok: boolean; key: string; reset: boolean }>(
      `/admin/settings/${encodeURIComponent(key)}/reset`,
      { method: "POST" }
    ),
  adminListPropertyTypes: () =>
    req<any[]>("/admin/property-types"),
  adminCreatePropertyType: (payload: {
    slug: string;
    label: string;
    icon: string;
    color: string;
    order?: number;
    subtypes?: string[];
    active?: boolean;
  }) => req<any>("/admin/property-types", { method: "POST", body: JSON.stringify(payload) }),
  adminPatchPropertyType: (
    slug: string,
    updates: {
      label?: string;
      icon?: string;
      color?: string;
      order?: number;
      subtypes?: string[];
      active?: boolean;
    }
  ) =>
    req<{ ok: boolean; updated: string[] }>(
      `/admin/property-types/${encodeURIComponent(slug)}`,
      { method: "PATCH", body: JSON.stringify(updates) }
    ),
  adminDeletePropertyType: (slug: string) =>
    req<{ ok: boolean; action: string }>(
      `/admin/property-types/${encodeURIComponent(slug)}`,
      { method: "DELETE" }
    ),

  // ─── Agent Platform (Phase 1: plans, quotas, onboarding, founding) ───
  listAgentPlans: () =>
    req<
      {
        id: string;
        name: string;
        tier: string;
        monthly_price_ngn: number;
        founding_price_ngn: number;
        effective_price_ngn: number;
        is_founding_price: boolean;
        listing_limit: number;
        premium_credits_per_month: number;
        team_seats: number;
        extra_seat_price_ngn: number;
        starter_kit_eligible: boolean;
        features: string[];
        cta: string;
        highlight: boolean;
      }[]
    >("/agent-platform/plans"),
  foundingCounter: () =>
    req<{ target: number; claimed: number; remaining: number; is_open: boolean }>(
      "/agent-platform/founding"
    ),
  mySubscription: () =>
    req<{
      plan_id: string;
      plan_name: string;
      status: string;
      listing_limit: number;
      monthly_price_ngn: number;
      is_founding_price: boolean;
      next_billing_at?: string | null;
      auto_default?: boolean;
    }>("/agent-platform/subscription/me"),
  subscribeToPlan: (plan_id: string, provider: "paystack" | "flutterwave" = "paystack") =>
    req<{
      ok: boolean;
      activated: boolean;
      requires_payment?: boolean;
      pending_reference?: string;
      plan_id: string;
      amount_ngn?: number;
      is_founding_price?: boolean;
      provider?: string;
    }>("/agent-platform/subscription/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan_id, provider }),
    }),
  activateSubscriptionMock: (pending_reference: string) =>
    req<{ ok: boolean; already?: boolean; subscription: any }>(
      `/agent-platform/subscription/activate?pending_reference=${encodeURIComponent(pending_reference)}`,
      { method: "POST" }
    ),
  cancelSubscription: () =>
    req<{ ok: boolean }>("/agent-platform/subscription/cancel", { method: "POST" }),
  myQuota: () =>
    req<{
      plan_id: string;
      plan_name: string;
      listing_limit: number;
      active_listings: number;
      remaining: number;
      at_limit: boolean;
    }>("/agent-platform/quota"),
  onboardingProgress: () =>
    req<{
      steps: { id: string; label: string; completed: boolean; optional: boolean }[];
      completed_count: number;
      total_steps: number;
      percent: number;
      can_go_live: boolean;
      starter_kit_status: string;
    }>("/agent-platform/onboarding"),
  myStarterKit: () =>
    req<{
      user_id: string;
      status: string;
      kit_type: string;
      eligible_at?: string;
      processing_at?: string;
      dispatched_at?: string;
      delivered_at?: string;
      tracking_reference?: string;
      delivery_address?: string;
      notes?: string;
    }>("/agent-platform/starter-kit/me"),

  // ─── Agent Platform v2 (Phase 2: public profile, badges, deletion) ───
  publicAgentBySlug: (slug: string) =>
    req<{
      user_id: string;
      slug: string;
      full_name: string;
      agency_name?: string | null;
      avatar_url?: string | null;
      state?: string | null;
      lga?: string | null;
      years_experience: number;
      areas_of_operation: string[];
      specialisations: string[];
      badge: { id: string; label: string; colour: string; icon: string; description: string };
      verification_level: number;
      is_founding_agent: boolean;
      rating: number;
      reviews_count: number;
      active_listings: number;
      verified_listings: number;
      total_sold: number;
      total_rented: number;
      response_rate: number;
      joined_at?: string | null;
      share_url: string;
    }>(`/agent-platform/public/${encodeURIComponent(slug)}`),
  publicAgentListings: (slug: string) =>
    req<Property[]>(`/agent-platform/public/${encodeURIComponent(slug)}/listings`),
  badgeProgress: () =>
    req<{
      current_badge: { id: string; label: string; colour: string; icon: string; description: string };
      next_badge: { id: string; label: string; colour: string; icon: string; description: string } | null;
      checks: { label: string; current: number; target: number; met: boolean }[];
      progress_percent: number;
    }>("/agent-platform/badge/progress"),
  badgeRules: () => req<any>("/agent-platform/badge/rules"),
  deleteMyAccount: () =>
    req<{ ok: boolean; deleted_at: string; scrubbed_collections: string[] }>(
      "/agent-platform/account/delete",
      { method: "POST" }
    ),

  // ─── Marketing & Sharing (Phase 3: WhatsApp deep links, QR, flyer) ───
  propertyShareBundle: (property_id: string) =>
    req<{
      share_url: string;
      qr_url: string;
      whatsapp_url: string;
      whatsapp_message: string;
      flyer_payload: {
        property: {
          id: string;
          title?: string;
          price?: number;
          currency?: string;
          listing_type?: string;
          property_type?: string;
          bedrooms?: number;
          bathrooms?: number;
          size_sqm?: number;
          city?: string;
          state?: string;
          location?: string;
          images?: string[];
          verified?: boolean;
          amenities?: string[];
        };
        agent?: any;
        brand: { name: string; tagline: string; domain: string; accent: string; ink: string };
      };
    }>(`/share/property/${encodeURIComponent(property_id)}`),
  agentShareBundle: (slug: string) =>
    req<{
      share_url: string;
      qr_url: string;
      whatsapp_url: string;
      whatsapp_message: string;
      flyer_payload: any;
    }>(`/share/agent/${encodeURIComponent(slug)}`),
  propertyStory: (property_id: string) => req<ListingStory>(`/share/property/${encodeURIComponent(property_id)}/story`),
  recordPropertyShare: (
    property_id: string,
    channel: "whatsapp" | "qr" | "copy_link" | "native_share" | "flyer" | "email" | "sms" | "story" | "story_series",
    context?: string
  ) =>
    req<{ ok: boolean }>(`/share/property/${encodeURIComponent(property_id)}/event`, {
      method: "POST",
      body: JSON.stringify({ channel, context }),
    }),
  recordAgentShare: (
    slug: string,
    channel: "whatsapp" | "qr" | "copy_link" | "native_share" | "flyer" | "email" | "sms",
    context?: string
  ) =>
    req<{ ok: boolean }>(`/share/agent/${encodeURIComponent(slug)}/event`, {
      method: "POST",
      body: JSON.stringify({ channel, context }),
    }),
  propertyShareStats: (property_id: string) =>
    req<{ total_shares: number; by_channel: Record<string, number> }>(
      `/share/property/${encodeURIComponent(property_id)}/stats`
    ),

  // ─── Phase 4: Reviews · Score · Analytics · CRM ───
  createAgentReview: (agent_user_id: string, rating: number, review_text?: string, transaction_context?: string) =>
    req<any>(`/reviews/agent/${encodeURIComponent(agent_user_id)}`, {
      method: "POST",
      body: JSON.stringify({ rating, review_text, transaction_context }),
    }),
  listAgentReviews: (slug: string, limit = 20) =>
    req<
      {
        id: string;
        agent_id: string;
        reviewer_id: string;
        reviewer_name?: string;
        reviewer_avatar?: string;
        rating: number;
        review_text?: string;
        transaction_context: string;
        status: string;
        created_at: string;
      }[]
    >(`/reviews/agent/${encodeURIComponent(slug)}?limit=${limit}`),
  myReviews: () => req<any[]>("/reviews/mine"),
  reportReview: (review_id: string, reason: string) =>
    req<{ ok: boolean; reports: number }>(`/reviews/${encodeURIComponent(review_id)}/report`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  agentScore: () =>
    req<{
      score: number;
      tier: string;
      factors: {
        id: string;
        label: string;
        value: number;
        weight: number;
        weighted: number;
        hint: string;
      }[];
      updated_at: string;
    }>("/agent/score"),
  agentAnalytics: (period_days = 30) =>
    req<{
      period_days: number;
      property_views: number;
      profile_views: number;
      leads: number;
      inspection_requests: number;
      shares_total: number;
      shares_by_channel: Record<string, number>;
      response_rate: number;
      top_property?: { id: string; title?: string; views: number; image?: string } | null;
      lead_pipeline: Record<string, number>;
      updated_at: string;
    }>(`/agent/analytics?period_days=${period_days}`),
  crmListLeads: (status?: string) =>
    req<any[]>(`/crm/leads${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  crmUpdateLead: (
    lead_id: string,
    updates: {
      status?: string;
      next_follow_up_at?: string;
      last_contact_at?: string;
      assigned_to?: string;
    }
  ) =>
    req<{ ok: boolean; updated: string[] }>(`/crm/leads/${encodeURIComponent(lead_id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  crmAddNote: (lead_id: string, text: string) =>
    req<{ ok: boolean; note: any }>(`/crm/leads/${encodeURIComponent(lead_id)}/note`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  // ─── Phase 6A/6B: Property Onboarding Wizard + Duplicate Detection ───
  onboardingStart: (client_submission_id: string) =>
    req<{ onboarding_id: string; status: string; resumed: boolean }>(
      "/agent/properties/onboarding",
      { method: "POST", body: JSON.stringify({ client_submission_id }) }
    ),
  onboardingGet: (oid: string) =>
    req<any>(`/agent/properties/onboarding/${encodeURIComponent(oid)}`),
  onboardingList: () => req<any[]>("/agent/properties/onboarding"),
  onboardingSaveLocation: (
    oid: string,
    location: {
      latitude: number;
      longitude: number;
      accuracy_meters: number;
      location_source: "GPS" | "NETWORK" | "MAP_SELECTED" | "ADDRESS_SEARCH" | "MANUAL";
      altitude?: number | null;
    },
    address?: {
      state: string;
      lga?: string;
      district?: string;
      area?: string;
      estate?: string;
      street?: string;
      house_number?: string;
      landmark?: string;
      raw_address?: string;
    }
  ) =>
    req<{ ok: boolean; status: string; gps_verification: string; gps_message: string }>(
      `/agent/properties/${encodeURIComponent(oid)}/location`,
      { method: "POST", body: JSON.stringify({ location, address }) }
    ),
  onboardingSaveDetails: (
    oid: string,
    body: {
      details?: {
        property_type: string;
        property_subtype?: string;
        bedrooms?: number;
        bathrooms?: number;
        floors?: number;
        land_size_sqm?: number;
        building_size_sqm?: number;
        amenities?: string[];
        year_built?: number;
      };
      listing?: {
        listing_type: "buy" | "rent" | "lease" | "shortlet";
        price: number;
        currency?: string;
        description?: string;
        title_document?: string;
        representation_type?: "owner" | "agent" | "agency" | "developer" | "landlord";
        owner_name?: string;
        owner_phone?: string;
      };
      media_ids?: string[];
    }
  ) =>
    req<{ ok: boolean }>(`/agent/properties/${encodeURIComponent(oid)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  onboardingDuplicateCheck: (oid: string) =>
    req<{
      search_radius_meters: number;
      highest_score: number;
      action: "allow" | "possible_duplicate" | "high_confidence_duplicate";
      high_confidence_threshold: number;
      possible_threshold: number;
      candidates: {
        amass_property_id: string;
        property_uuid: string;
        distance_meters: number;
        score: number;
        reasons: string[];
        breakdown: Record<string, number>;
        preview: {
          state?: string;
          lga?: string;
          area?: string;
          estate?: string;
          street?: string;
          property_type?: string;
          bedrooms?: number;
        };
      }[];
    }>(`/agent/properties/${encodeURIComponent(oid)}/duplicate-check`, {
      method: "POST",
    }),
  duplicateCheckAdhoc: (payload: {
    latitude: number;
    longitude: number;
    accuracy_meters?: number;
    property_type?: string;
    bedrooms?: number;
    bathrooms?: number;
    building_size_sqm?: number;
    address?: Record<string, any>;
  }) =>
    req<{
      search_radius_meters: number;
      highest_score: number;
      action: "allow" | "possible_duplicate" | "high_confidence_duplicate";
      high_confidence_threshold: number;
      possible_threshold: number;
      candidates: {
        amass_property_id: string;
        distance_meters: number;
        score: number;
        reasons: string[];
        preview: Record<string, any>;
      }[];
    }>("/agent/properties/duplicate-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  onboardingRecordDecision: (
    oid: string,
    payload: {
      client_submission_id: string;
      duplicate_decision: "same_property" | "not_same_property";
      same_as_amass_id?: string;
      not_same_reason?: string;
    }
  ) =>
    req<{ ok: boolean; decision: string }>(
      `/agent/properties/${encodeURIComponent(oid)}/decision`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  onboardingSubmit: (oid: string, client_submission_id: string) =>
    req<{
      ok: boolean;
      idempotent?: boolean;
      attached_to_existing?: boolean;
      amass_property_id: string;
      property_id: string;
      listing_id: string;
      status: string;
    }>(`/agent/properties/${encodeURIComponent(oid)}/submit`, {
      method: "POST",
      body: JSON.stringify({ client_submission_id }),
    }),
  agentMyPropertiesV2: () => req<any[]>("/agent/properties/mine"),

  // ─── Phase 6C: Public Property Passport ───
  getPassport: (amass_id: string) =>
    req<{
      property: {
        amass_property_id: string;
        property_type?: string;
        property_subtype?: string;
        state?: string;
        lga?: string;
        area?: string;
        estate?: string;
        street?: string;
        house_number?: string;
        identity_status?: string;
        physical_status?: string;
        has_verified_representation?: boolean;
        created_at?: string;
        coordinates?: { latitude: number; longitude: number } | null;
        coordinates_precision?: "exact" | "~100m";
        details?: {
          bedrooms?: number;
          bathrooms?: number;
          floors?: number;
          year_built?: number;
        };
        size?: { building_size_sqm?: number; land_size_sqm?: number };
        amenities?: string[];
        photos?: string[];
      };
      listings: {
        id: string;
        listing_type?: string;
        listing_status?: string;
        price?: number;
        currency?: string;
        description?: string;
        representation_type?: string;
        created_at?: string;
      }[];
      representatives: {
        id: string;
        representation_type: string;
        mandate_type?: string;
        mandate_expiry?: string;
        decided_at?: string;
        agent: {
          user_id: string;
          slug?: string;
          full_name?: string;
          agency_name?: string;
          avatar_url?: string;
          verification_level?: number;
          rating?: number;
          reviews_count?: number;
        };
      }[];
      timeline: { action: string; label: string; at: string }[];
      share: {
        passport_url: string;
        qr_url?: string | null;
        allow_enquiries: boolean;
      };
      visibility: Record<string, boolean>;
      generated_at: string;
    }>(`/passport/${encodeURIComponent(amass_id)}`),

  // ─── Phase 6C: Representations & Claims (agent-facing) ───
  myRepresentations: (status?: string) =>
    req<any[]>(
      `/agent/representations/mine${status ? `?status=${encodeURIComponent(status)}` : ""}`
    ),
  getRepresentation: (rep_id: string) =>
    req<any>(`/agent/representations/${encodeURIComponent(rep_id)}`),
  submitClaim: (
    rep_id: string,
    payload: {
      representation_type?:
        | "owner"
        | "agent_mandate"
        | "landlord"
        | "developer"
        | "property_manager"
        | "agency";
      mandate_type?: "exclusive" | "sole" | "open" | "verbal" | "written";
      mandate_expiry?: string;
      documents?: string[];
      owner_name?: string;
      owner_phone?: string;
      notes?: string;
    }
  ) =>
    req<{ ok: boolean; claim_id: string; status: string }>(
      `/agent/representations/${encodeURIComponent(rep_id)}/claim`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  patchRepresentation: (
    rep_id: string,
    payload: {
      documents?: string[];
      mandate_type?: string;
      mandate_expiry?: string;
      notes?: string;
    }
  ) =>
    req<{ ok: boolean }>(`/agent/representations/${encodeURIComponent(rep_id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  publicPropertyReps: (amass_id: string) =>
    req<any[]>(`/properties-v2/${encodeURIComponent(amass_id)}/representations`),

  // ─── Phase 6D: Admin Cockpit ───
  adminDashboard: () =>
    req<{
      pending_duplicate_review: number;
      pending_representations: number;
      docs_requested: number;
      total_properties: number;
      total_listings: number;
      merged_properties: number;
      pending_estates: number;
      open_social_reports: number;
      generated_at: string;
    }>("/admin/cockpit/dashboard"),
  adminDuplicateQueue: (limit = 50) =>
    req<{
      items: {
        property: {
          amass_property_id: string;
          property_uuid: string;
          state?: string;
          lga?: string;
          area?: string;
          estate?: string;
          street?: string;
          property_type?: string;
          created_at?: string;
          created_by?: string;
          review_reason?: string;
          duplicate_score_at_creation?: number;
          cover?: string | null;
        };
        candidates: {
          amass_property_id: string;
          property_uuid: string;
          state?: string;
          area?: string;
          street?: string;
          estate?: string;
          property_type?: string;
          created_at?: string;
          cover?: string | null;
        }[];
      }[];
      total_flagged: number;
    }>(`/admin/cockpit/duplicate-queue?limit=${limit}`),
  adminResolveDupReview: (
    amass_id: string,
    payload: { action: "clear" | "flag_for_merge"; reason?: string; merge_with_amass_id?: string }
  ) =>
    req<{ ok: boolean; status: string }>(
      `/admin/cockpit/duplicate-queue/${encodeURIComponent(amass_id)}/decide`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  adminCompareProperties: (a: string, b: string) =>
    req<{ a: any; b: any }>(
      `/admin/cockpit/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
    ),
  adminMergeProperties: (payload: { winner_amass_id: string; loser_amass_id: string; reason?: string }) =>
    req<{
      ok: boolean;
      winner_amass_id: string;
      loser_amass_id: string;
      listings_moved: number;
      reps_moved: number;
    }>("/admin/cockpit/merge", { method: "POST", body: JSON.stringify(payload) }),
  adminVerifyProperty: (
    amass_id: string,
    payload: { action: "verify" | "unverify"; reason?: string }
  ) =>
    req<{ ok: boolean; status: string }>(
      `/admin/cockpit/property/${encodeURIComponent(amass_id)}/verify`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  adminAuditLogs: (params: {
    property_id?: string;
    action?: string;
    actor_type?: "agent" | "admin";
    since?: string;
    until?: string;
    limit?: number;
    cursor?: string;
  }) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "" && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return req<{
      items: {
        id: string;
        property_id?: string;
        actor_id?: string;
        actor_type?: string;
        action: string;
        new_value?: any;
        old_value?: any;
        reason?: string;
        created_at: string;
      }[];
      next_cursor: string | null;
      count: number;
    }>(`/admin/cockpit/audit-logs${qs ? `?${qs}` : ""}`);
  },
  adminAuditActions: () => req<string[]>("/admin/cockpit/audit-logs/actions"),
  adminRepQueue: (status = "PENDING", limit = 50) =>
    req<any[]>(
      `/admin/representations/queue?status=${encodeURIComponent(status)}&limit=${limit}`
    ),
  adminRepDecide: (
    rep_id: string,
    payload: {
      action: "approve" | "reject" | "request_docs" | "suspend" | "revoke";
      reason?: string;
      valid_until?: string;
    }
  ) =>
    req<{ ok: boolean; status?: string; already?: boolean }>(
      `/admin/representations/${encodeURIComponent(rep_id)}/decide`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  adminGetPassportFull: (amass_id: string) =>
    req<any>(`/admin/passport/${encodeURIComponent(amass_id)}/full`),

  // ─── Phase D-4: Discovery duplicate review ───
  adminCandidateReview: (cand_id: string) =>
    req<{
      candidate: {
        id: string;
        google_place_id?: string;
        candidate_type?: string;
        status?: string;
        name?: string;
        address?: string;
        latitude?: number;
        longitude?: number;
        google_types?: string[];
        primary_type?: string;
        duplicate_score?: number;
        promoted_to_amass_property_id?: string | null;
        related_amass_property_id?: string | null;
        admin_override_keep_separate?: boolean;
        created_at?: string;
        reviewed_at?: string;
        review_notes?: string | null;
      };
      highest_score: number;
      recommended_action: "allow" | "possible_duplicate" | "high_confidence_duplicate";
      matches: {
        amass_property_id: string;
        property_uuid: string;
        property_type?: string;
        property_identity_status?: string;
        location_verification_status?: string;
        state?: string;
        lga?: string;
        area?: string;
        estate?: string;
        street?: string;
        raw_address?: string;
        latitude?: number;
        longitude?: number;
        listings_count?: number;
        representations_count?: number;
        aliases?: string[];
        created_at?: string;
        distance_meters: number;
        score: number;
        reasons: string[];
      }[];
      override_history: {
        id: string;
        action: string;
        amass_property_id?: string | null;
        reason?: string | null;
        actor_email?: string;
        created_at: string;
      }[];
    }>(`/admin/discovery/candidates/${encodeURIComponent(cand_id)}/review`),
  adminCandidateResolve: (
    cand_id: string,
    payload: {
      action: "MERGE" | "KEEP_SEPARATE" | "MARK_RELATED";
      amass_property_id?: string;
      reason?: string;
    }
  ) =>
    req<{
      ok: boolean;
      action: string;
      candidate_id: string;
      amass_property_id?: string;
      property_uuid?: string;
      override_id: string;
      next_status?: string;
    }>(`/admin/discovery/candidates/${encodeURIComponent(cand_id)}/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminListCandidates: (params: {
    status?: string;
    candidate_type?: string;
    limit?: number;
  } = {}) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "" && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return req<{
      items: {
        id: string;
        google_place_id?: string;
        candidate_type?: string;
        status?: string;
        name?: string;
        address?: string;
        latitude?: number;
        longitude?: number;
        duplicate_score?: number;
        duplicate_matches?: { amass_property_id: string; score: number }[];
        created_at?: string;
      }[];
      count: number;
    }>(`/admin/discovery/candidates${qs ? `?${qs}` : ""}`);
  },
  adminDiscoveryOverrides: (params: {
    candidate_id?: string;
    amass_property_id?: string;
    action?: string;
    limit?: number;
  } = {}) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "" && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return req<{
      items: any[];
      count: number;
    }>(`/admin/discovery/overrides${qs ? `?${qs}` : ""}`);
  },

  // ─── Phase D-5: Agent verification tasks + territory ───
  agentGetTerritory: () =>
    req<{
      agent_id: string;
      state: string | null;
      lgas: string[];
      areas: string[];
      center_lat?: number | null;
      center_lng?: number | null;
      radius_km?: number | null;
      is_active: boolean;
    }>("/agent/territory/me"),
  agentSetTerritory: (payload: {
    state: string;
    lgas: string[];
    areas?: string[];
    center_lat?: number | null;
    center_lng?: number | null;
    radius_km?: number | null;
    is_active?: boolean;
  }) =>
    req<any>("/agent/territory/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  agentVerificationTasks: (include_completed = false) =>
    req<{
      territory: any | null;
      claimed_by_me: any[];
      open_in_territory: any[];
      counts: { claimed: number; open: number };
    }>(`/agent/verification-tasks?include_completed=${include_completed}`),
  agentVerificationTask: (id: string) =>
    req<{ task: any; property: any | null }>(
      `/agent/verification-tasks/${encodeURIComponent(id)}`
    ),
  agentClaimTask: (id: string) =>
    req<any>(`/agent/verification-tasks/${encodeURIComponent(id)}/claim`, {
      method: "POST",
    }),
  agentReleaseTask: (id: string) =>
    req<any>(`/agent/verification-tasks/${encodeURIComponent(id)}/release`, {
      method: "POST",
    }),
  agentSubmitVerification: (
    id: string,
    payload: {
      verdict:
        | "PROPERTY_EXISTS"
        | "DIFFERENT_ADDRESS"
        | "IS_DUPLICATE"
        | "NOT_A_PROPERTY"
        | "INACCESSIBLE";
      latitude: number;
      longitude: number;
      accuracy_meters?: number;
      photo_data_url?: string;
      notes?: string;
      corrected_address?: Record<string, any>;
      duplicate_of_amass_id?: string;
    }
  ) =>
    req<{
      ok: boolean;
      task_status: string;
      property_status?: string;
      drift_from_pin_meters?: number | null;
      photo_path?: string | null;
    }>(`/agent/verification-tasks/${encodeURIComponent(id)}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ─── Phase D-5: Admin verification tasks ───
  adminListVerificationTasks: (params: {
    status?: string;
    state?: string;
    agent_id?: string;
    limit?: number;
  } = {}) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "" && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return req<{
      items: any[];
      count: number;
      counts_by_status: Record<string, number>;
    }>(`/admin/verification-tasks${qs ? `?${qs}` : ""}`);
  },
  adminAssignVerificationTask: (id: string, agent_id: string) =>
    req<any>(`/admin/verification-tasks/${encodeURIComponent(id)}/assign`, {
      method: "POST",
      body: JSON.stringify({ agent_id }),
    }),
  adminCancelVerificationTask: (id: string, reason?: string) =>
    req<{ ok: boolean }>(
      `/admin/verification-tasks/${encodeURIComponent(id)}/cancel`,
      { method: "POST", body: JSON.stringify({ reason: reason ?? "cancelled" }) }
    ),
  adminCreateVerificationTask: (amass_id: string, priority = "normal") =>
    req<any>(
      `/admin/verification-tasks/create-for-property/${encodeURIComponent(amass_id)}`,
      { method: "POST", body: JSON.stringify({ priority }) }
    ),

  // ─── Phase D-6: Verification score ───
  getPropertyScore: (amass_id: string) =>
    req<{
      amass_property_id: string;
      score: number;
      tier: "SUPER" | "VERIFIED" | "UNSTABLE" | "UNVERIFIED";
      breakdown: Record<string, number>;
      computed_at?: string;
      verified_at?: string | null;
      location_verification_status?: string;
    }>(`/properties-v2/${encodeURIComponent(amass_id)}/score`),
  adminListFraudFlags: (params: { status?: string; flag_type?: string; limit?: number } = {}) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "" && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return req<{
      items: any[];
      count: number;
      counts_by_type: Record<string, number>;
    }>(`/admin/fraud/flags${qs ? `?${qs}` : ""}`);
  },
  adminDismissFraudFlag: (flag_id: string, reason?: string) =>
    req<{ ok: boolean }>(`/admin/fraud/flags/${encodeURIComponent(flag_id)}/dismiss`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? "false positive" }),
    }),
  adminRecomputeScore: (amass_id: string) =>
    req<any>(`/admin/properties/${encodeURIComponent(amass_id)}/recompute-score`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  // ─── Phase D-8: AI Valuation ───
  getPropertyValuation: (amass_id: string, forceRefresh = false) =>
    req<{
      amass_property_id: string;
      value: number;
      range_low: number;
      range_high: number;
      currency: string;
      confidence: number;
      method: string;
      comparables_count: number;
      dispersion_pct: number;
      narrative?: string | null;
      valued_at: string;
    }>(
      `/properties-v2/${encodeURIComponent(amass_id)}/valuation${
        forceRefresh ? "?force_refresh=true" : ""
      }`
    ),
  adminRefreshValuation: (amass_id: string) =>
    req<any>(`/admin/valuations/${encodeURIComponent(amass_id)}/refresh`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  // ─── In-App Chat (Phase 1) ───
  chatStartFromProperty: (property_id: string) =>
    req<any>(`/chat/conversations/from-property/${encodeURIComponent(property_id)}`, {
      method: "POST",
    }),
  chatStartSupport: () =>
    req<any>("/chat/conversations/support", { method: "POST" }),
  chatListConversations: (
    limit = 50,
    opts?: { verified_only?: boolean; q?: string }
  ) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (opts?.verified_only) qs.set("verified_only", "true");
    if (opts?.q?.trim()) qs.set("q", opts.q.trim());
    return req<{ items: any[]; count: number }>(`/chat/conversations?${qs.toString()}`);
  },
  chatGetConversation: (id: string) =>
    req<any>(`/chat/conversations/${encodeURIComponent(id)}`),
  chatListMessages: (id: string, before?: string, limit = 30) => {
    const qs = new URLSearchParams();
    if (before) qs.set("before", before);
    qs.set("limit", String(limit));
    return req<{ items: any[]; count: number }>(
      `/chat/conversations/${encodeURIComponent(id)}/messages?${qs.toString()}`
    );
  },
  chatSendMessage: (
    id: string,
    payload: { text: string; client_msg_id?: string; kind?: "text" | "property_card" | "image" | "audio"; attachments?: any[] }
  ) =>
    req<any>(`/chat/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  chatMarkRead: (id: string) =>
    req<any>(`/chat/conversations/${encodeURIComponent(id)}/read`, { method: "POST" }),
  chatPollUpdates: (id: string, after: string, wait_ms = 8000) =>
    req<{ items: any[]; server_time: string }>(
      `/chat/conversations/${encodeURIComponent(id)}/updates?after=${encodeURIComponent(after)}&wait_ms=${wait_ms}`
    ),
  chatUnreadCount: () =>
    req<{ unread_count: number; conversation_count: number }>("/chat/unread-count"),
  chatBlockUser: (user_id: string) =>
    req<any>(`/chat/block/${encodeURIComponent(user_id)}`, { method: "POST" }),
  chatUnblockUser: (user_id: string) =>
    req<any>(`/chat/block/${encodeURIComponent(user_id)}`, { method: "DELETE" }),
  chatReport: (payload: {
    conversation_id: string; message_id?: string; reported_user_id?: string; reason: string;
  }) =>
    req<any>("/chat/report", { method: "POST", body: JSON.stringify(payload) }),
  adminChatReports: (status = "OPEN", limit = 50) =>
    req<any>(`/chat/admin/reports?status=${status}&limit=${limit}`),
  adminChatResolveReport: (id: string, resolution?: string) =>
    req<{ ok: boolean }>(`/chat/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution: resolution ?? "resolved" }),
    }),
  adminChatStats: () => req<any>("/chat/admin/stats"),

  // ─── Chat Phase 2: image, search, presence, typing ───
  chatUploadImage: (conv_id: string, data_url: string, width?: number, height?: number) =>
    req<{ url: string; path: string; width?: number; height?: number }>(
      `/chat/conversations/${encodeURIComponent(conv_id)}/upload-image`,
      { method: "POST", body: JSON.stringify({ data_url, width, height }) }
    ),
  chatSearch: (q: string, limit = 30) =>
    req<{ items: any[]; count: number }>(
      `/chat/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
  chatHeartbeat: () => req<any>("/chat/heartbeat", { method: "POST" }),
  chatTyping: (id: string, is_typing: boolean) =>
    req<any>(`/chat/conversations/${encodeURIComponent(id)}/typing`, {
      method: "POST",
      body: JSON.stringify({ is_typing }),
    }),
  chatPresence: (id: string) =>
    req<{
      typing_user_ids: string[];
      presence: { user_id: string; last_seen_at: string }[];
      server_time: string;
    }>(`/chat/conversations/${encodeURIComponent(id)}/presence`),

  // ─── Chat Phase 2b: Voice notes ───
  chatUploadAudio: (conv_id: string, data_url: string, duration_ms?: number) =>
    req<{ url: string; path: string; duration_ms?: number }>(
      `/chat/conversations/${encodeURIComponent(conv_id)}/upload-audio`,
      { method: "POST", body: JSON.stringify({ data_url, duration_ms }) }
    ),

  // ─── Push notifications (Emergent-managed) ───
  registerPush: (body: { user_id: string; platform: "ios" | "android"; device_token: string }) =>
    req<{ status: string }>("/register-push", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  adminGetVisibility: (amass_id: string) =>
    req<Record<string, boolean>>(
      `/admin/passport/${encodeURIComponent(amass_id)}/visibility`
    ),
  adminPatchVisibility: (amass_id: string, updates: Record<string, boolean>) =>
    req<{ ok: boolean; updated: string[] }>(
      `/admin/passport/${encodeURIComponent(amass_id)}/visibility`,
      { method: "PATCH", body: JSON.stringify(updates) }
    ),
};

export const AUTH_STORAGE_KEY = AUTH_KEY;
