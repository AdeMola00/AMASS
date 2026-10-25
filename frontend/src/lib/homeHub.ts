/**
 * My Home hub — data layer. Types + API + the bits that make saving reliable on weak connections:
 *   • every create carries a client-generated id, so a retried request can never double-save;
 *   • `withRetry` re-sends network failures (not server errors) with a short back-off;
 *   • `uploadFile` sends small files in one go and anything bigger in resumable chunks;
 *   • an on-device outbox keeps JSON-only saves made while offline and flushes them later.
 */
import * as Crypto from "expo-crypto";
import { ApiError, qs, req } from "./api";
import { storage } from "@/src/utils/storage";

export type Freq = "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type Schedule = { freq: Freq; interval?: number; unit?: "days" | "weeks" | "months" };
export type FileRef = { path: string; url: string; name?: string | null; content_type?: string | null; size?: number | null };
export type HomeKind = "flat" | "house" | "duplex" | "land" | "office" | "shop" | "other";
export type Home = { id: string; user_id: string; name: string; address?: string | null; kind: HomeKind; color: string; is_default: boolean; created_at: string };
export type DueStatus = "overdue" | "due_soon" | "upcoming" | "paid" | "done" | "archived" | "none";

export type Bill = {
  id: string;
  home_id: string;
  name: string;
  category: string;
  amount: number;
  due_date: string;
  next_due: string;
  schedule: Schedule;
  schedule_label: string;
  reminders: number[];
  payee?: string | null;
  notes?: string | null;
  archived: boolean;
  paid_at?: string | null;
  last_paid_at?: string | null;
  paid_count: number;
  status: DueStatus;
  days_until: number | null;
};
export type Payment = { id: string; bill_id: string; bill_name: string; amount: number; paid_at: string; period_due?: string | null; note?: string | null; record_id?: string | null };
export type BillDetail = Bill & { payments: Payment[]; records: HomeRecord[]; home?: Home | null };

export type HomeRecord = {
  id: string;
  home_id: string;
  title: string;
  folder: string;
  file?: FileRef | null;
  notes?: string | null;
  expires_at?: string | null;
  expiry_reminders: number[];
  bill_id?: string | null;
  payment_id?: string | null;
  item_id?: string | null;
  repair_id?: string | null;
  created_at: string;
  expiry_status: "none" | "expired" | "expiring" | "valid";
  days_until_expiry: number | null;
  bill?: { id: string; name: string; amount?: number } | null;
  item?: { id: string; name: string } | null;
  repair?: { id: string; title: string } | null;
};

export type HomeItem = {
  id: string;
  home_id: string;
  name: string;
  room: string;
  photo?: FileRef | null;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  store?: string | null;
  purchased_at?: string | null;
  price?: number | null;
  value?: number | null;
  warranty_until?: string | null;
  warranty_reminders: number[];
  notes?: string | null;
  created_at: string;
  warranty_status: "none" | "expired" | "expiring" | "active";
  warranty_days: number | null;
  records?: HomeRecord[];
  repairs?: Repair[];
};

export type RepairLog = { id: string; repair_id: string; repair_title?: string; date: string; cost?: number | null; notes?: string | null; photos: FileRef[]; provider_name?: string | null; provider_id?: string | null; fixa_booking_id?: string | null };
export type Repair = {
  id: string;
  home_id: string;
  title: string;
  trade: string;
  schedule: Schedule;
  schedule_label: string;
  next_due?: string | null;
  reminders: number[];
  item_id?: string | null;
  provider_id?: string | null;
  notes?: string | null;
  last_done_at?: string | null;
  done_count: number;
  total_cost: number;
  status: DueStatus;
  days_until: number | null;
  logs?: RepairLog[];
  records?: HomeRecord[];
  item?: { id: string; name: string; room?: string; photo?: FileRef | null } | null;
  provider?: { id: string; name: string; seller_name?: string; phone?: string; whatsapp?: string; subcategory?: string } | null;
};

export type DueItem = { type: "bill" | "repair" | "record" | "item" | "payment" | "repair_done"; id: string; title: string; subtitle: string; date: string; status: DueStatus; amount?: number | null; category?: string; trade?: string; home_id?: string; path: string };
export type Overview = {
  today: string;
  homes: Home[];
  home_id: string;
  home: Home | null;
  next_due: DueItem[];
  counts: { bills: number; records: number; items: number; repairs: number; saved: number };
  attention: { overdue: number; due_soon: number; bills: { overdue: number; due_soon: number }; repairs: { overdue: number; due_soon: number } };
  month: { label: string; due_total: number; paid_total: number; overdue_total: number; from: string; to: string };
};
export type CalendarMonth = { month: string; today: string; events: DueItem[]; days: Record<string, DueStatus[]> };
export type Catalog = {
  bill_categories: { key: string; label: string; icon: string }[];
  record_folders: { key: string; label: string; icon: string }[];
  rooms: string[];
  repair_trades: string[];
  home_colors: string[];
  home_kinds: HomeKind[];
  default_reminders: { bill: number[]; expiry: number[]; warranty: number[] };
  due_soon_days: number;
  today: string;
};

export type BillIn = { id?: string; home_id: string; name: string; category: string; amount: number; due_date: string; schedule: Schedule; reminders: number[]; payee?: string | null; notes?: string | null };
export type RecordIn = { id?: string; home_id: string; title: string; folder: string; file?: FileRef | null; notes?: string | null; expires_at?: string | null; expiry_reminders?: number[]; bill_id?: string | null; payment_id?: string | null; item_id?: string | null; repair_id?: string | null };
export type ItemIn = { id?: string; home_id: string; name: string; room: string; photo?: FileRef | null; brand?: string | null; model?: string | null; serial?: string | null; store?: string | null; purchased_at?: string | null; price?: number | null; value?: number | null; warranty_until?: string | null; warranty_reminders?: number[]; notes?: string | null };
export type RepairIn = { id?: string; home_id: string; title: string; trade: string; schedule: Schedule; next_due?: string | null; reminders: number[]; item_id?: string | null; provider_id?: string | null; notes?: string | null };
export type HomeIn = { id?: string; name: string; address?: string | null; kind: HomeKind; color?: string | null; is_default?: boolean };

const j = (body: unknown) => JSON.stringify(body);

export const homeApi = {
  catalog: () => req<Catalog>("/home/catalog"),
  homes: () => req<{ items: Home[] }>("/home/homes"),
  createHome: (body: HomeIn) => req<Home>("/home/homes", { method: "POST", body: j(body) }),
  updateHome: (id: string, body: HomeIn) => req<Home>(`/home/homes/${id}`, { method: "PUT", body: j(body) }),
  deleteHome: (id: string, force = false) => req<{ ok: boolean }>(`/home/homes/${id}${qs({ force: force || undefined })}`, { method: "DELETE" }),
  overview: (home_id?: string | null) => req<Overview>(`/home/overview${qs({ home_id })}`),
  badge: () => req<{ count: number }>("/home/badge"),
  calendar: (month: string, home_id?: string | null) => req<CalendarMonth>(`/home/calendar${qs({ month, home_id })}`),

  bills: (p: { home_id?: string | null; status?: string; include_archived?: boolean } = {}) => req<{ items: Bill[]; count: number; summary: Record<string, number>; today: string }>(`/home/bills${qs(p)}`),
  bill: (id: string) => req<BillDetail>(`/home/bills/${id}`),
  createBill: (body: BillIn) => req<Bill>("/home/bills", { method: "POST", body: j(body) }),
  updateBill: (id: string, body: BillIn) => req<Bill>(`/home/bills/${id}`, { method: "PUT", body: j(body) }),
  archiveBill: (id: string, restore = false) => req<{ ok: boolean }>(`/home/bills/${id}/archive${qs({ restore: restore || undefined })}`, { method: "POST" }),
  deleteBill: (id: string) => req<{ ok: boolean }>(`/home/bills/${id}`, { method: "DELETE" }),
  payBill: (id: string, body: { amount?: number | null; paid_at?: string; note?: string; receipt?: FileRef | null; record_id?: string | null } = {}) => req<{ ok: boolean; bill: Bill; payment: Payment; receipt: HomeRecord | null }>(`/home/bills/${id}/pay`, { method: "POST", body: j(body) }),
  undoPayment: (billId: string, paymentId: string) => req<{ ok: boolean; bill: Bill | null }>(`/home/bills/${billId}/payments/${paymentId}`, { method: "DELETE" }),

  records: (p: { home_id?: string | null; folder?: string; bill_id?: string; item_id?: string; repair_id?: string; q?: string } = {}) => req<{ items: HomeRecord[]; count: number; folders: Record<string, number> }>(`/home/records${qs(p)}`),
  record: (id: string) => req<HomeRecord>(`/home/records/${id}`),
  createRecord: (body: RecordIn) => req<HomeRecord>("/home/records", { method: "POST", body: j(body) }),
  updateRecord: (id: string, body: RecordIn) => req<HomeRecord>(`/home/records/${id}`, { method: "PUT", body: j(body) }),
  deleteRecord: (id: string) => req<{ ok: boolean }>(`/home/records/${id}`, { method: "DELETE" }),

  items: (p: { home_id?: string | null; room?: string; q?: string } = {}) => req<{ items: HomeItem[]; count: number; total_value: number; rooms: Record<string, number> }>(`/home/items${qs(p)}`),
  item: (id: string) => req<HomeItem>(`/home/items/${id}`),
  createItem: (body: ItemIn) => req<HomeItem>("/home/items", { method: "POST", body: j(body) }),
  updateItem: (id: string, body: ItemIn) => req<HomeItem>(`/home/items/${id}`, { method: "PUT", body: j(body) }),
  deleteItem: (id: string) => req<{ ok: boolean }>(`/home/items/${id}`, { method: "DELETE" }),

  repairs: (p: { home_id?: string | null; status?: string } = {}) => req<{ items: Repair[]; count: number; summary: Record<string, number> }>(`/home/repairs${qs(p)}`),
  repair: (id: string) => req<Repair>(`/home/repairs/${id}`),
  createRepair: (body: RepairIn) => req<Repair>("/home/repairs", { method: "POST", body: j(body) }),
  updateRepair: (id: string, body: RepairIn) => req<Repair>(`/home/repairs/${id}`, { method: "PUT", body: j(body) }),
  deleteRepair: (id: string) => req<{ ok: boolean }>(`/home/repairs/${id}`, { method: "DELETE" }),
  repairDone: (id: string, body: { date?: string; cost?: number | null; notes?: string; photos?: FileRef[]; provider_name?: string; provider_id?: string; fixa_booking_id?: string }) => req<{ ok: boolean; repair: Repair; log: RepairLog }>(`/home/repairs/${id}/done`, { method: "POST", body: j(body) }),
  deleteRepairLog: (repairId: string, logId: string) => req<{ ok: boolean }>(`/home/repairs/${repairId}/logs/${logId}`, { method: "DELETE" }),

  uploadDirect: (data_url: string, name?: string) => req<FileRef>("/home/uploads", { method: "POST", body: j({ data_url, name }) }),
  uploadStart: (body: { name?: string; content_type: string; size: number; total_chunks: number }) => req<{ upload_id: string }>("/home/uploads/start", { method: "POST", body: j(body) }),
  uploadStatus: (id: string) => req<{ received: number[]; total_chunks: number }>(`/home/uploads/${id}`),
  uploadChunk: (id: string, index: number, data: string) => req<{ ok: boolean; received: number }>(`/home/uploads/${id}/chunks/${index}`, { method: "PUT", body: j({ data }) }),
  uploadComplete: (id: string) => req<FileRef>(`/home/uploads/${id}/complete`, { method: "POST" }),
};

/* ─── Reliability helpers ─────────────────────────────────────────────── */
export const newId = () => Crypto.randomUUID();

/** True for "the request never reached the server" failures (offline, DNS, aborted) — safe to retry. */
export function isNetworkError(e: unknown): boolean {
  return !(e instanceof ApiError);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Re-send on network errors only; server errors (4xx/5xx) surface immediately. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isNetworkError(e) || i === attempts - 1) throw e;
      await sleep(600 * (i + 1));
    }
  }
  throw last;
}

/* ─── Uploads: one shot for small files, resumable chunks for big ones ──── */
const DIRECT_LIMIT = 700 * 1024; // bytes of raw file
const CHUNK_B64 = 1_000_000; // chars of base64 per chunk (~750 KB)

export type UploadInput = { base64: string; contentType: string; name?: string; size?: number };

export async function uploadFile(input: UploadInput, onProgress?: (fraction: number) => void): Promise<FileRef> {
  const size = input.size ?? Math.floor((input.base64.length * 3) / 4);
  if (size <= DIRECT_LIMIT) {
    onProgress?.(0.2);
    const out = await withRetry(() => homeApi.uploadDirect(`data:${input.contentType};base64,${input.base64}`, input.name));
    onProgress?.(1);
    return out;
  }
  const total = Math.ceil(input.base64.length / CHUNK_B64);
  const start = await withRetry(() => homeApi.uploadStart({ name: input.name, content_type: input.contentType, size, total_chunks: total }));
  for (let i = 0; i < total; i++) {
    const data = input.base64.slice(i * CHUNK_B64, (i + 1) * CHUNK_B64);
    await withRetry(() => homeApi.uploadChunk(start.upload_id, i, data), 4);
    onProgress?.((i + 1) / (total + 1));
  }
  const done = await withRetry(() => homeApi.uploadComplete(start.upload_id));
  onProgress?.(1);
  return done;
}

/* ─── Selected home (per device) ──────────────────────────────────────── */
const HOME_KEY = "amass_home_hub_selected_v1";
export const selectedHome = {
  get: () => storage.getItem<string | null>(HOME_KEY, null),
  set: (id: string | null) => storage.setItem(HOME_KEY, id),
};

/* ─── Offline outbox for JSON-only saves ──────────────────────────────── */
export type OutboxEntry = { id: string; kind: "bill" | "record" | "item" | "repair"; body: BillIn | RecordIn | ItemIn | RepairIn; title: string; at: string };
const OUTBOX_KEY = "amass_home_hub_outbox_v1";

export const outbox = {
  list: async (): Promise<OutboxEntry[]> => (await storage.getItem<OutboxEntry[]>(OUTBOX_KEY, [])) ?? [],
  async add(entry: Omit<OutboxEntry, "at">) {
    const cur = await this.list();
    await storage.setItem(OUTBOX_KEY, [...cur.filter((e) => e.id !== entry.id), { ...entry, at: new Date().toISOString() }]);
    homeHubSignal.bump();
  },
  /** Try every queued save; keep the ones that still fail on the network. Returns how many synced. */
  async flush(): Promise<number> {
    const cur = await this.list();
    if (!cur.length) return 0;
    const remaining: OutboxEntry[] = [];
    let synced = 0;
    for (const e of cur) {
      try {
        if (e.kind === "bill") await homeApi.createBill(e.body as BillIn);
        else if (e.kind === "record") await homeApi.createRecord(e.body as RecordIn);
        else if (e.kind === "item") await homeApi.createItem(e.body as ItemIn);
        else await homeApi.createRepair(e.body as RepairIn);
        synced++;
      } catch (err) {
        if (isNetworkError(err)) remaining.push(e);
        // a server rejection (e.g. the home was deleted) drops the entry so it can't block the queue forever
      }
    }
    await storage.setItem(OUTBOX_KEY, remaining);
    if (synced) homeHubSignal.bump();
    return synced;
  },
};

/** Save now, or park it in the outbox when the network is down. Returns where it went. */
export async function saveOrQueue<T>(entry: Omit<OutboxEntry, "at">, fn: () => Promise<T>): Promise<{ saved: true; result: T } | { saved: false }> {
  try {
    return { saved: true, result: await withRetry(fn, 2) };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await outbox.add(entry);
    return { saved: false };
  }
}

/* ─── Change signal: screens re-fetch when something was saved elsewhere ── */
type Listener = () => void;
const listeners = new Set<Listener>();
export const homeHubSignal = {
  bump: () => listeners.forEach((l) => l()),
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
