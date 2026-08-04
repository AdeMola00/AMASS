import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MapPin, BedDouble, Bath, Ruler, ShieldCheck, Heart, Lock,
  Home, Building, Car, Sparkles, ArrowLeft, Phone
} from "lucide-react";

export function PropertyDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prop, setProp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getProperty(id).then((p) => {
      setProp(p);
      setLoading(false);
      api.recordView(id).catch(() => {});
    }).catch(() => setLoading(false));
    if (user) {
      api.favoriteIds().then((r) => setFav(r.ids.includes(id))).catch(() => {});
    }
  }, [id, user]);

  const toggleFav = async () => {
    if (!user) { navigate("/login"); return; }
    try {
      const r = await api.toggleFavorite(id);
      setFav(r.favorited);
      toast.success(r.favorited ? "Saved to favorites" : "Removed from favorites");
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-neutral-500">Loading…</div>;
  }
  if (!prop) {
    return <div className="min-h-[60vh] flex items-center justify-center">Property not found.</div>;
  }

  const images = prop.images && prop.images.length > 0
    ? prop.images
    : ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8" data-testid="property-detail">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black mb-6">
        <ArrowLeft size={14} /> Back
      </button>

      {/* Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-3 relative aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-100">
          <img src={images[activeImg]} alt={prop.title} className="w-full h-full object-cover" data-testid="hero-image" />
          <button
            onClick={toggleFav}
            className={`absolute top-4 right-4 h-11 w-11 rounded-full flex items-center justify-center transition-colors ${
              fav ? "bg-[color:var(--amass-red)] text-white" : "bg-white/90 text-neutral-800 hover:bg-white"
            }`}
            data-testid="favorite-btn"
          >
            <Heart size={18} fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="grid grid-cols-4 md:grid-cols-1 gap-3">
          {images.slice(0, 4).map((src, i) => (
            <button
              key={i}
              onClick={() => setActiveImg(i)}
              className={`aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                activeImg === i ? "border-[color:var(--amass-red)]" : "border-transparent hover:border-neutral-300"
              }`}
              data-testid={`thumb-${i}`}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* Content grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {prop.status === "premium" && <Badge className="bg-black text-white">Premium</Badge>}
              {prop.verified && <Badge variant="outline" className="text-[color:var(--amass-red)] border-[color:var(--amass-red)]">
                <ShieldCheck size={12} className="mr-1" /> Verified
              </Badge>}
              {prop.listing_source && (
                <Badge variant="outline" className="text-neutral-700">
                  {prop.listing_source.replace("_", " ")}
                </Badge>
              )}
            </div>
            <h1 className="font-display text-4xl md:text-5xl leading-none">{prop.title}</h1>
            <div className="mt-2 flex items-center gap-1 text-neutral-500">
              <MapPin size={14} /> {prop.location || prop.city}, {prop.state}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <SpecCard icon={<BedDouble />} label="Bedrooms" value={prop.bedrooms || "—"} />
            <SpecCard icon={<Bath />} label="Bathrooms" value={prop.bathrooms || "—"} />
            <SpecCard icon={<Ruler />} label="Size" value={prop.size_sqm ? `${prop.size_sqm} m²` : "—"} />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">About this property</h2>
            <p className="text-neutral-600 leading-relaxed whitespace-pre-line">{prop.description}</p>
          </div>

          {prop.amenities && prop.amenities.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-3">Amenities</h2>
              <div className="flex flex-wrap gap-2">
                {prop.amenities.map((a) => (
                  <span key={a} className="px-3 py-1.5 rounded-full text-xs bg-neutral-100 text-neutral-800">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {prop.token_cost > 0 && !prop.unlocked && (
            <div className="rounded-2xl border-2 border-dashed border-[color:var(--amass-red)] bg-red-50 p-6">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-[color:var(--amass-red)] text-white flex items-center justify-center shrink-0">
                  <Lock size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Premium listing</h3>
                  <p className="mt-1 text-sm text-neutral-700">
                    Unlock the full address, agent contact, and mandate documents
                    for <span className="font-semibold">{prop.token_cost} MASS tokens</span>. Free for AMASS-exclusive sales.
                  </p>
                  {!user && (
                    <Link to="/login">
                      <Button className="mt-4 amass-btn-red rounded-full">Sign in to unlock</Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky sidebar */}
        <div className="lg:sticky lg:top-24 self-start">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 amass-shadow-card">
            <div className="text-xs font-semibold uppercase tracking-widest text-[color:var(--amass-red)]">
              {prop.listing_type === "rent" ? "Yearly rent" : prop.listing_type === "shortlet" ? "Per night" : "Sale price"}
            </div>
            <div className="mt-1 font-display text-4xl">{formatNaira(prop.price)}</div>
            {prop.ai_valuation && (
              <div className="mt-1 text-xs text-neutral-500 flex items-center gap-1">
                <Sparkles size={12} /> AI valuation: {formatNaira(prop.ai_valuation)}
              </div>
            )}
            <div className="mt-6 space-y-3">
              <Button className="w-full amass-btn-primary rounded-full h-11" data-testid="contact-btn">
                <Phone size={14} className="mr-2" /> Contact agent
              </Button>
              <Button variant="outline" className="w-full rounded-full h-11" onClick={toggleFav} data-testid="save-btn">
                <Heart size={14} className="mr-2" fill={fav ? "currentColor" : "none"} />
                {fav ? "Saved" : "Save"}
              </Button>
            </div>

            {prop.agent_name && (
              <div className="mt-6 pt-6 border-t border-neutral-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-100 overflow-hidden">
                  {prop.agent_avatar && <img src={prop.agent_avatar} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{prop.agent_name}</div>
                  <div className="text-xs text-neutral-500">AMASS Verified Agent</div>
                </div>
              </div>
            )}
          </div>

          {prop.investment_score && (
            <div className="mt-4 rounded-2xl bg-neutral-900 text-white p-6">
              <div className="text-xs uppercase tracking-widest opacity-70">Investment Score</div>
              <div className="mt-2 font-display text-5xl">{prop.investment_score}/100</div>
              <p className="mt-2 text-sm opacity-80">
                Based on price appreciation, rental yield, walkability and neighborhood infrastructure.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpecCard({ icon, label, value }) {
  return (
    <div className="p-4 rounded-xl border border-neutral-200">
      <div className="text-neutral-500 mb-2">{icon}</div>
      <div className="font-semibold text-lg">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
