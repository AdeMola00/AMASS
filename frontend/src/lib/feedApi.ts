/**
 * AMASS Feed client — one continuous social-commerce stream (`/api/feed/*`).
 * Posts (general · sale · free · service · property · promo), stories, emoji reactions, threaded comments,
 * share / repost / save, follow, @mentions, creator profiles + dashboard, and the in-app admin queue.
 */
import { req } from "@/src/lib/api";

export type FeedPostType = "general" | "sale" | "free" | "service" | "property" | "promo";
export type FeedFilter = "all" | "following" | "nearby" | "properties" | "services" | "products" | "videos";
export type FeedPostStatus = "active" | "reserved" | "gone" | "paused" | "hidden_review" | "removed";
export type ReactionKey = "like" | "love" | "fire" | "wow" | "laugh" | "sad";

export type FeedAuthor = {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  verified?: boolean;
  is_business?: boolean;
  business_name?: string | null;
  followers?: number;
  same_estate?: boolean;
  handle?: string | null;
  member_since?: number | null;
};

export type FeedVideo = { url: string; thumb?: string | null; duration?: number | null };
export type FeedProperty = { id: string; title?: string; price?: number; listing_type?: string; city?: string; image?: string | null; bedrooms?: number; bathrooms?: number; property_type?: string; verified?: boolean; agent_name?: string };

export type FeedPost = {
  id: string;
  type: FeedPostType;
  type_label: string;
  kind?: string | null;
  title: string;
  body: string;
  photos: string[];
  videos: FeedVideo[];
  cover?: string | null;
  price?: number | null;
  negotiable: boolean;
  category?: string | null;
  category_label?: string | null;
  condition?: string | null;
  condition_label?: string | null;
  delivery?: string | null;
  service?: { category: string; starting_price?: number | null; coverage?: string | null } | null;
  property?: FeedProperty | null;
  promo?: { business_name: string; offer?: string | null; link_url?: string | null; ends_at?: string | null; brand_id?: string | null } | null;
  visibility: string;
  location_label: string;
  city?: string | null;
  contact: { chat: boolean; whatsapp: boolean; phone: boolean };
  status: FeedPostStatus;
  sponsored: boolean;
  label?: string | null;
  reactions: Record<ReactionKey, number>;
  reaction_count: number;
  comment_count: number;
  share_count: number;
  repost_count: number;
  save_count: number;
  view_count: number;
  video_views: number;
  my_reaction?: ReactionKey | null;
  saved: boolean;
  following_author: boolean;
  is_mine: boolean;
  mentions: string[];
  hashtags: string[];
  tags: { products?: string[]; brands?: string[]; properties?: string[] };
  repost_of?: string | null;
  repost_comment?: string | null;
  market_item_id?: string | null;
  moderation?: { status?: string | null; summary?: string | null; decision_note?: string | null; labels?: string[] | null } | null;
  created_at: string;
  updated_at?: string;
  edited: boolean;
  author: FeedAuthor;
};

export type FeedComment = { id: string; body: string; parent_id?: string | null; like_count: number; created_at: string; author?: FeedAuthor | null; is_mine: boolean; is_poster: boolean; liked?: boolean };

export type FeedPostDetail = FeedPost & {
  comments: FeedComment[];
  author_stats: { posts: number; followers: number; bio?: string | null };
  can_contact: boolean;
  quick_messages: string[];
  original?: FeedPost | null;
  similar: FeedPost[];
};

export type FixaColumnItem = { id: string; display_name: string; initials?: string; category?: string; categories?: string[]; rating?: number; reviews?: number; area?: string; city?: string; verified?: boolean; badges?: string[]; image?: string | null; description?: string; starting_price?: number | null };
export type BrandColumnItem = { product_id: string; name: string; price?: number | null; image?: string | null; promo?: { label?: string | null; previous_price?: number | null } | null; brand: { id: string; name: string; logo?: string | null; slug?: string | null; verified: boolean; accent?: string | null; following: boolean } };
export type HomeColumnItem = { id: string; title?: string; price?: number; listing_type?: string; city?: string; image?: string | null; bedrooms?: number; property_type?: string; verified: boolean; promoted: boolean; agent_name?: string };

export type FeedRow =
  | { kind: "post"; id: string; post: FeedPost }
  | { kind: "fixa"; id: string; title: string; subtitle: string; items: FixaColumnItem[]; see_all: string }
  | { kind: "brands"; id: string; title: string; subtitle: string; items: BrandColumnItem[]; see_all: string }
  | { kind: "homes"; id: string; title: string; subtitle: string; items: HomeColumnItem[]; see_all: string };

export type FeedPage = { rows: FeedRow[]; next_cursor: string | null; filter: FeedFilter; city: string; home_city: string; count: number };

export type FeedMeta = {
  post_types: { key: FeedPostType; label: string; hint: string; icon: string; color: string }[];
  reactions: { key: ReactionKey; emoji: string; label: string }[];
  filters: { key: FeedFilter; label: string; icon: string }[];
  categories: { key: string; label: string; icon: string; color: string }[];
  conditions: { key: string; label: string }[];
  delivery: { key: string; label: string }[];
  service_categories: string[];
  scopes: { estates: { id: string; name: string; area?: string | null }[]; areas: string[]; city: string };
  cities: string[];
  defaults: { visibility: string; estate_id: string | null; has_phone: boolean; filter: FeedFilter };
  prefs: { show_sponsored: boolean; autoplay_videos: boolean; interests: string[] };
  story_expiry_hours: number;
  quick_messages: string[];
  me: { handle?: string | null; display_name?: string | null; is_admin: boolean };
};

export type Story = { id: string; media_url: string; media_type: "image" | "video"; caption?: string | null; link_post_id?: string | null; created_at: string; expires_at: string; view_count: number; seen: boolean; is_mine: boolean };
export type StoryGroup = { author_id: string; author: FeedAuthor; stories: Story[]; unseen: number; latest: string; is_mine: boolean; following: boolean };
export type StoriesPayload = { groups: StoryGroup[]; expiry_hours: number; can_post: boolean };

export type FeedPostInput = {
  type: FeedPostType;
  title?: string | null;
  body: string;
  photos: string[];
  videos: FeedVideo[];
  price?: number | null;
  negotiable?: boolean;
  category?: string | null;
  condition?: string | null;
  delivery?: "pickup" | "delivery" | "both" | null;
  service_category?: string | null;
  starting_price?: number | null;
  coverage?: string | null;
  property_id?: string | null;
  business_name?: string | null;
  offer?: string | null;
  link_url?: string | null;
  visibility: "estate" | "area" | "city" | "everyone";
  estate_id?: string | null;
  location_label?: string | null;
  contact_chat: boolean;
  contact_whatsapp: boolean;
  contact_phone: boolean;
  tagged_products?: string[];
  tagged_brands?: string[];
  sponsored?: boolean;
};

export type CreatorProfile = FeedAuthor & {
  bio?: string | null;
  website?: string | null;
  creator_category?: string | null;
  badges: string[];
  stats: { posts: number; followers: number; following: number; reactions: number };
  following: boolean;
  is_me: boolean;
  blocked: boolean;
  posts: FeedPost[];
  fixa_provider?: { id: string; trade?: string | null; verified: boolean } | null;
  agent: { is_agent: boolean };
};

export type CreatorDashboard = {
  period_days: number;
  profile: { handle?: string | null; display_name?: string | null; bio?: string | null; is_business?: boolean; business_name?: string | null; creator_verified?: boolean; creator_category?: string | null; website?: string | null };
  totals: { followers: number; new_followers: number; posts: number; reach: number; views: number; reactions: number; comments: number; shares: number; saves: number; video_views: number; enquiries: number; offers: number; engagement_rate: number };
  views_series: number[];
  by_type: Record<string, number>;
  top_posts: FeedPost[];
  note: string;
};

export type AdminOverview = {
  posts_live: number; posts_7d: number; flagged: number; review: number; appeals: number; reports_open: number; stories_live: number;
  reactions_7d: number; comments_7d: number; follows_7d: number; sponsored_live: number; verified_creators: number; suspended: number;
  settings: Record<string, any>;
};
export type AdminPost = FeedPost & { moderation: { status?: string; score?: number; labels?: string[]; summary?: string; checked_at?: string | null; decision_note?: string | null; ai_checked?: boolean }; reports: number; appeal?: { id: string; message: string; created_at: string } | null; author: FeedAuthor & { suspended?: boolean; strikes?: number } };

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.set(k, String(v)));
  const s = u.toString();
  return s ? `?${s}` : "";
};
const enc = encodeURIComponent;

export const feedApi = {
  meta: () => req<FeedMeta>("/feed/meta"),
  feed: (params: { filter?: FeedFilter; city?: string; category?: string; type?: string; q?: string; sort?: "ranked" | "latest"; cursor?: string | null; limit?: number } = {}) => req<FeedPage>(`/feed${qs(params)}`),
  stories: () => req<StoriesPayload>("/feed/stories"),
  createStory: (body: { media_url: string; media_type: "image" | "video"; caption?: string | null; link_post_id?: string | null }) => req<{ ok: boolean; story: Story }>("/feed/stories", { method: "POST", body: JSON.stringify(body) }),
  viewStory: (id: string) => req<{ ok: boolean }>(`/feed/stories/${enc(id)}/view`, { method: "POST" }),
  deleteStory: (id: string) => req<{ ok: boolean }>(`/feed/stories/${enc(id)}`, { method: "DELETE" }),

  createPost: (body: FeedPostInput) => req<{ ok: boolean; post: FeedPost }>("/feed/posts", { method: "POST", body: JSON.stringify(body) }),
  editPost: (id: string, body: Partial<FeedPostInput> & { status?: "active" | "reserved" | "gone" | "paused" }) => req<{ ok: boolean; post: FeedPost }>(`/feed/posts/${enc(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePost: (id: string) => req<{ ok: boolean }>(`/feed/posts/${enc(id)}`, { method: "DELETE" }),
  mine: () => req<{ items: FeedPost[]; counts: Record<string, number> }>("/feed/posts/mine"),
  post: (id: string) => req<FeedPostDetail>(`/feed/posts/${enc(id)}`),

  react: (id: string, emoji: ReactionKey | null) => req<{ my_reaction: ReactionKey | null; reactions: Record<ReactionKey, number>; reaction_count: number }>(`/feed/posts/${enc(id)}/react`, { method: "POST", body: JSON.stringify({ emoji }) }),
  whoReacted: (id: string) => req<{ items: { emoji: ReactionKey; user: FeedAuthor }[] }>(`/feed/posts/${enc(id)}/reactions`),
  comment: (id: string, body: string, parent_id?: string | null) => req<{ ok: boolean; comment: FeedComment }>(`/feed/posts/${enc(id)}/comments`, { method: "POST", body: JSON.stringify({ body, parent_id: parent_id ?? null }) }),
  deleteComment: (id: string, comment_id: string) => req<{ ok: boolean }>(`/feed/posts/${enc(id)}/comments/${enc(comment_id)}`, { method: "DELETE" }),
  likeComment: (id: string, comment_id: string) => req<{ liked: boolean; like_count: number }>(`/feed/posts/${enc(id)}/comments/${enc(comment_id)}/like`, { method: "POST" }),
  share: (id: string, channel: "copy" | "whatsapp" | "native" | "repost", comment?: string) => req<{ ok: boolean; share_count?: number; url?: string; repost?: FeedPost }>(`/feed/posts/${enc(id)}/share`, { method: "POST", body: JSON.stringify({ channel, comment }) }),
  toggleSave: (id: string) => req<{ saved: boolean }>(`/feed/posts/${enc(id)}/save`, { method: "POST" }),
  saved: () => req<{ items: FeedPost[] }>("/feed/saved"),
  views: (post_ids: string[], video_ids: string[] = []) => req<{ ok: boolean; counted: number }>("/feed/views", { method: "POST", body: JSON.stringify({ post_ids, video_ids }) }),
  follow: (target_id: string, target_type: "user" | "brand" | "provider" = "user") => req<{ following: boolean; follower_count: number }>(`/feed/follow/${enc(target_id)}`, { method: "POST", body: JSON.stringify({ target_type }) }),
  following: () => req<{ items: { target_type: string; id: string; name: string; image?: string | null; subtitle?: string; path: string }[] }>("/feed/following"),
  user: (id: string) => req<CreatorProfile>(`/feed/users/${enc(id)}`),
  patchMe: (body: { display_name?: string; handle?: string; bio?: string; business_name?: string; creator_category?: string; website?: string; is_business?: boolean }) => req<{ ok: boolean; profile: any }>("/feed/me", { method: "PATCH", body: JSON.stringify(body) }),
  mentionSearch: (q: string) => req<{ items: (FeedAuthor & { handle?: string | null })[] }>(`/feed/mentions/search${qs({ q })}`),
  creatorDashboard: (days = 30) => req<CreatorDashboard>(`/feed/creator/dashboard${qs({ days })}`),
  contact: (id: string, channel: "chat" | "whatsapp" | "phone", message?: string) => req<{ channel: string; conversation_id?: string; number?: string; url?: string }>(`/feed/posts/${enc(id)}/contact`, { method: "POST", body: JSON.stringify({ channel, message }) }),
  hide: (id: string) => req<{ ok: boolean }>(`/feed/posts/${enc(id)}/hide`, { method: "POST" }),
  report: (id: string, reason: string, details?: string) => req<{ ok: boolean; duplicate?: boolean }>(`/feed/posts/${enc(id)}/report`, { method: "POST", body: JSON.stringify({ reason, details }) }),
  appeal: (id: string, body: string) => req<{ ok: boolean }>(`/feed/posts/${enc(id)}/appeal`, { method: "POST", body: JSON.stringify({ body }) }),
  tagProperties: (q = "") => req<{ items: (FeedProperty & { mine: boolean })[] }>(`/feed/tag/properties${qs({ q })}`),
  tagProducts: (q = "") => req<{ items: { id: string; name: string; price?: any; image?: string | null; brand?: string | null; brand_id?: string | null }[] }>(`/feed/tag/products${qs({ q })}`),
  upload: (data_url: string) => req<{ url: string; path: string }>("/social/posts/uploads", { method: "POST", body: JSON.stringify({ data_url }) }),

  // In-app admin (is_admin) — the Admin Control Portal uses the same functions under /api/portal/feed/*
  adminOverview: () => req<AdminOverview>("/feed/admin/overview"),
  adminQueue: (status: AdminQueueStatus) => req<{ items: AdminPost[]; count: number }>(`/feed/admin/queue${qs({ status })}`),
  adminPost: (id: string) => req<AdminPostDetail>(`/feed/admin/posts/${enc(id)}`),
  adminDecide: (id: string, action: "approve" | "remove" | "hide", note?: string) => req<{ ok: boolean; status: string; moderation_status: string }>(`/feed/admin/posts/${enc(id)}/decide`, { method: "POST", body: JSON.stringify({ action, note }) }),
  adminRescreen: (id: string) => req<{ ok: boolean; moderation: AdminPost["moderation"] }>(`/feed/admin/posts/${enc(id)}/rescreen`, { method: "POST" }),
  adminSponsored: (id: string, sponsored: boolean) => req<{ ok: boolean; sponsored: boolean }>(`/feed/admin/posts/${enc(id)}/sponsored`, { method: "POST", body: JSON.stringify({ sponsored }) }),
  adminUserAction: (user_id: string, action: AdminUserAction, note?: string) => req<{ ok: boolean }>(`/feed/admin/users/${enc(user_id)}/action`, { method: "POST", body: JSON.stringify({ action, note }) }),
  adminSettings: (body: Record<string, any>) => req<Record<string, any>>("/feed/admin/settings", { method: "PUT", body: JSON.stringify(body) }),
};

export type AdminQueueStatus = "flagged" | "review" | "appealed" | "reported" | "sponsored" | "removed";
export type AdminUserAction = "verify" | "unverify" | "warn" | "suspend" | "restore" | "clear_strikes";
export type AdminPostDetail = AdminPost & {
  report_list: { id: string; reason: string; details?: string | null; created_at: string; reporter?: FeedAuthor | null }[];
  recent_comments: { id: string; body: string; author_id: string; created_at: string }[];
  audit: { id: string; action: string; actor_id?: string | null; meta?: Record<string, any>; created_at: string }[];
};

export const REACTION_EMOJI: Record<ReactionKey, string> = { like: "👍", love: "❤️", fire: "🔥", wow: "😮", laugh: "😂", sad: "😢" };
export const REACTION_LABEL: Record<ReactionKey, string> = { like: "Like", love: "Love", fire: "Fire", wow: "Wow", laugh: "Haha", sad: "Sad" };
export const REACTION_KEYS: ReactionKey[] = ["like", "love", "fire", "wow", "laugh", "sad"];

export const TYPE_META: Record<FeedPostType, { label: string; icon: string; tone: "neutral" | "brand" | "success" | "warning" | "info" | "premium" }> = {
  general: { label: "Post", icon: "chatbubbles", tone: "neutral" },
  sale: { label: "For sale", icon: "pricetag", tone: "brand" },
  free: { label: "Free", icon: "gift", tone: "success" },
  service: { label: "Service", icon: "construct", tone: "warning" },
  property: { label: "Property", icon: "home", tone: "info" },
  promo: { label: "Promotion", icon: "megaphone", tone: "premium" },
};

export function naira(n?: number | null): string {
  return `₦${Math.round(n ?? 0).toLocaleString("en-NG")}`;
}

export function shortCount(n?: number | null): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(v);
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = 60_000, h = 60 * m, d = 24 * h;
  if (diff < m) return "Now";
  if (diff < h) return `${Math.round(diff / m)}m`;
  if (diff < d) return `${Math.round(diff / h)}h`;
  if (diff < 7 * d) return `${Math.round(diff / d)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Resolve API-relative media URLs (`/api/public-files/...`) to absolute for <Image> / <Video>. */
const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
export function mediaUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  return u.startsWith("http") || u.startsWith("data:") ? u : `${BASE}${u}`;
}

export const postUrl = (id: string) => `https://amass.africa/social/post/${id}`;
