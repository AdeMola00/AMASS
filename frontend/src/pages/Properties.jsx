import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { PropertyCard } from "@/components/PropertyCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";

const LISTING_TYPES = [
  { value: "any", label: "Any type" },
  { value: "buy", label: "For sale" },
  { value: "rent", label: "For rent" },
  { value: "shortlet", label: "Short-let" },
  { value: "lease", label: "Lease" },
];

const PROPERTY_TYPES = [
  { value: "any", label: "All types" },
  { value: "duplex", label: "Duplex" },
  { value: "apartment", label: "Apartment" },
  { value: "bungalow", label: "Bungalow" },
  { value: "terrace", label: "Terrace" },
  { value: "penthouse", label: "Penthouse" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
];

export function Properties() {
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(sp.get("q") || "");
  const [listingType, setListingType] = useState(sp.get("listing_type") || "any");
  const [propertyType, setPropertyType] = useState(sp.get("property_type") || "any");
  const [city, setCity] = useState(sp.get("city") || "");

  const load = () => {
    setLoading(true);
    api
      .listProperties({
        q: q || undefined,
        listing_type: listingType !== "any" ? listingType : undefined,
        property_type: propertyType !== "any" ? propertyType : undefined,
        city: city || undefined,
        limit: 60,
      })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const params = {};
    if (q) params.q = q;
    if (listingType !== "any") params.listing_type = listingType;
    if (propertyType !== "any") params.property_type = propertyType;
    if (city) params.city = city;
    setSp(params);
    load();
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10" data-testid="properties-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)] mb-1">
            Properties
          </div>
          <h1 className="font-display text-4xl md:text-5xl">Browse the market</h1>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="rounded-2xl border border-neutral-200 bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-3"
        data-testid="properties-filters"
      >
        <div className="md:col-span-2 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, area, keyword…"
            className="pl-9 h-11 rounded-xl"
            data-testid="properties-search"
          />
        </div>
        <Select value={listingType} onValueChange={setListingType}>
          <SelectTrigger className="h-11 rounded-xl" data-testid="filter-listing-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LISTING_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={propertyType} onValueChange={setPropertyType}>
          <SelectTrigger className="h-11 rounded-xl" data-testid="filter-property-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROPERTY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" className="h-11 rounded-xl amass-btn-primary" data-testid="apply-filters">
          <Filter size={14} className="mr-2" /> Apply
        </Button>
      </form>

      <div className="mt-8 text-sm text-neutral-500" data-testid="results-count">
        {loading ? "Searching…" : `${items.length} listing${items.length === 1 ? "" : "s"} found`}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((p) => (
          <PropertyCard key={p.id} property={p} />
        ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="text-center py-24 text-neutral-500">
          No properties match your filters. Try widening your search.
        </div>
      )}
    </div>
  );
}
