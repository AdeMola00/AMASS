// Offline draft persistence for the Agent Onboarding Wizard.
// Keyed by client_submission_id (aka idempotency key) so the same wizard run
// resumes across app restarts and cold starts.
//
// Payloads are JSON-stringified before hitting storage.setItem (which only
// accepts primitives).

import { storage } from "@/src/utils/storage";

export const DRAFT_KEY_PREFIX = "amass_onboarding_v1::";
export const ACTIVE_DRAFT_KEY = "amass_onboarding_active_v1";

export type WizardStep = 0 | 1 | 2 | 3 | 4;

export type OnboardingDraft = {
  client_submission_id: string;
  onboarding_id?: string;
  step: WizardStep;
  location?: {
    latitude: number;
    longitude: number;
    accuracy_meters: number;
    location_source: "GPS" | "NETWORK" | "MAP_SELECTED" | "ADDRESS_SEARCH" | "MANUAL";
  };
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
  };
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
    representation_type?: "owner" | "agent" | "agency" | "developer" | "landlord";
    owner_name?: string;
    owner_phone?: string;
  };
  media_ids?: string[]; // base64 data URIs
  duplicate_action?: "allow" | "possible_duplicate" | "high_confidence_duplicate";
  duplicate_decision?: "same_property" | "not_same_property";
  updated_at: number;
};

function makeId(): string {
  // 24-char client submission id — collision-resistant enough for idempotency.
  const rnd = Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}${rnd}`.padEnd(16, "x").slice(0, 24);
}

export async function newDraft(): Promise<OnboardingDraft> {
  const client_submission_id = makeId();
  const draft: OnboardingDraft = {
    client_submission_id,
    step: 0,
    updated_at: Date.now(),
  };
  await saveDraft(draft);
  await storage.setItem(ACTIVE_DRAFT_KEY, client_submission_id);
  return draft;
}

export async function saveDraft(draft: OnboardingDraft): Promise<boolean> {
  const key = DRAFT_KEY_PREFIX + draft.client_submission_id;
  const payload: OnboardingDraft = { ...draft, updated_at: Date.now() };
  return storage.setItem(key, JSON.stringify(payload));
}

export async function loadDraft(client_submission_id: string): Promise<OnboardingDraft | null> {
  const key = DRAFT_KEY_PREFIX + client_submission_id;
  const raw = await storage.getItem<string>(key, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
}

export async function loadActiveDraft(): Promise<OnboardingDraft | null> {
  const id = await storage.getItem<string>(ACTIVE_DRAFT_KEY, "");
  if (!id) return null;
  return loadDraft(id);
}

export async function clearActiveDraft(): Promise<void> {
  const id = await storage.getItem<string>(ACTIVE_DRAFT_KEY, "");
  if (id) {
    await storage.removeItem(DRAFT_KEY_PREFIX + id);
  }
  await storage.removeItem(ACTIVE_DRAFT_KEY);
}
