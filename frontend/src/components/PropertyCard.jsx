import React from "react";
import { Link } from "react-router-dom";
import { formatNaira } from "@/lib/api";
import { MapPin, BedDouble, Bath, Ruler, ShieldCheck, Lock } from "lucide-react";

export function PropertyCard({ property, className = "" }) {
  const p = property;
  const img =
    (p.images && p.images[0]) ||
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800";
  const badge =
    p.status === "premium"
      ? { label: "Premium", cls: "bg-black text-white" }
      : p.status === "verified" || p.verified
        ? { label: "Verified", cls: "bg-white/95 text-black border border-black" }
        : p.status === "sold"
          ? { label: "Sold", cls: "bg-neutral-800 text-white" }
          : null;

  return (
    <Link
      to={`/properties/${p.id}`}
      className={`group block bg-white rounded-2xl overflow-hidden amass-shadow-card amass-shadow-hover ${className}`}
      data-testid={`property-card-${p.id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <img
          src={img}
          alt={p.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          loading="lazy"
        />
        {badge && (
          <div
            className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${badge.cls}`}
          >
            {badge.label}
          </div>
        )}
        {p.token_cost > 0 && !p.unlocked && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[color:var(--amass-red)] text-white">
            <Lock size={10} /> {p.token_cost} MASS
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-serif text-2xl leading-none">
            {formatNaira(p.price)}
          </div>
          {(p.verified || p.status === "verified") && (
            <ShieldCheck size={16} className="text-[color:var(--amass-red)]" />
          )}
        </div>
        <h3 className="mt-2 text-sm font-semibold text-neutral-900 line-clamp-2">
          {p.title}
        </h3>
        <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
          <MapPin size={12} />
          <span className="truncate">{p.location || p.city}</span>
        </div>
        <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-4 text-xs text-neutral-600">
          {p.bedrooms > 0 && (
            <span className="flex items-center gap-1">
              <BedDouble size={12} /> {p.bedrooms}
            </span>
          )}
          {p.bathrooms > 0 && (
            <span className="flex items-center gap-1">
              <Bath size={12} /> {p.bathrooms}
            </span>
          )}
          {p.size_sqm > 0 && (
            <span className="flex items-center gap-1">
              <Ruler size={12} /> {p.size_sqm}m²
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
