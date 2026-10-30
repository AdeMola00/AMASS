// Centralised content + curated imagery for the AMASS landing page.
// Images are premium royalty-free (Unsplash/Pexels). Aerials favour Lagos.

export const IMAGES = {
  heroAerial:
    "https://images.pexels.com/photos/27741697/pexels-photo-27741697.jpeg?auto=compress&cs=tinysrgb&w=2400",
  heroAerialAlt:
    "https://images.unsplash.com/photo-1618828665347-d0f4d1c1c0d1?q=80&w=2400&auto=format&fit=crop",
};

// Hero map markers positioned over the aerial image (percentages).
export const MARKERS = [
  {
    id: "m1", status: "available", top: "44%", left: "57%", delay: 0.2,
    price: "₦185M", title: "4-Bed Waterfront Duplex", address: "Banana Island, Ikoyi",
    beds: 4, baths: 5, sqm: 420, type: "Duplex", verified: true,
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m2", status: "premium", top: "52%", left: "69%", delay: 0.8,
    price: "₦420M", title: "Penthouse with Ocean View", address: "Eko Atlantic, VI",
    beds: 5, baths: 6, sqm: 610, type: "Penthouse", verified: true,
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m3", status: "verified", top: "63%", left: "61%", delay: 1.4,
    price: "₦95M", title: "Smart 3-Bed Apartment", address: "Lekki Phase 1",
    beds: 3, baths: 3, sqm: 210, type: "Apartment", verified: true,
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m4", status: "coming_soon", top: "45%", left: "82%", delay: 2.0,
    price: "₦260M", title: "New Development · Terraces", address: "Ikate, Lekki",
    beds: 4, baths: 4, sqm: 340, type: "Terrace", verified: false,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m5", status: "sold", top: "65%", left: "76%", delay: 2.6,
    price: "₦140M", title: "Detached Family Home", address: "Osborne, Ikoyi",
    beds: 4, baths: 4, sqm: 380, type: "Detached", verified: true,
    image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m6", status: "available", top: "56%", left: "52%", delay: 3.2,
    price: "₦72M", title: "Serviced Studio · Short Let", address: "Victoria Island",
    beds: 1, baths: 1, sqm: 65, type: "Studio", verified: true,
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=800&auto=format&fit=crop",
  },
];

export const MARKER_LEGEND = [
  { status: "available", label: "For Sale", color: "var(--m-available)" },
  { status: "sold", label: "For Rent", color: "var(--m-sold)" },
  { status: "premium", label: "For Lease", color: "var(--m-premium)" },
  { status: "coming_soon", label: "Short-let", color: "var(--m-coming)" },
  { status: "verified", label: "Hotel", color: "var(--m-verified)" },
];

export const TRUST = [
  "Verified Listings",
  "AI Powered",
  "Secure Transactions",
  "Nationwide Coverage",
];

export const CATEGORIES = [
  { id: "luxury", name: "Luxury Homes", count: "2,400+", image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1200&auto=format&fit=crop" },
  { id: "apartments", name: "Apartments", count: "8,100+", image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=1200&auto=format&fit=crop" },
  { id: "commercial", name: "Commercial", count: "1,900+", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1200&auto=format&fit=crop" },
  { id: "land", name: "Land", count: "5,300+", image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200&auto=format&fit=crop" },
  { id: "shortlets", name: "Short Lets", count: "3,700+", image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=1200&auto=format&fit=crop" },
  { id: "new", name: "New Developments", count: "640+", image: "https://images.unsplash.com/photo-1590725140246-20acdee442be?q=80&w=1200&auto=format&fit=crop" },
  { id: "construction", name: "Construction Projects", count: "310+", image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=1200&auto=format&fit=crop" },
];

export const PILLARS = [
  {
    id: "marketplace", index: "01", title: "Property Marketplace",
    desc: "Sales, rentals, leases, short-lets and hotels on one intelligent map.",
    items: ["For Sale (Green)", "For Rent (Red)", "For Lease (Purple)", "Short-lets", "Hotels", "Commercial", "Land"],
    icon: "MapPin",
  },
  {
    id: "passport", index: "02", title: "Property Passport",
    desc: "A verified identity for every property — documents, ownership and inspection history, portable across transactions.",
    items: ["Verified Ownership", "Documents", "Inspection Trail", "Transferable", "Tamper-proof"],
    icon: "ShieldCheck",
  },
  {
    id: "fixa", index: "03", title: "FIXA Home Services",
    desc: "Trusted pros for repairs, plumbing, electrical and maintenance — booked from inside the app.",
    items: ["Plumbing", "Electrical", "Painting", "Cleaning", "Carpentry", "HVAC", "Appliance Repair"],
    icon: "Wrench",
  },
  {
    id: "declutter", index: "04", title: "Declutter",
    desc: "Sell what you no longer need via listings and share-ready social posts.",
    items: ["Marketplace Listings", "Social Posts", "In-app Chat", "Secure Payouts"],
    icon: "Boxes",
  },
  {
    id: "brands", index: "05", title: "Brand Products & Offers",
    desc: "Curated deals from trusted home, lifestyle and construction brands.",
    items: ["Furniture", "Appliances", "Finishes", "Electronics", "Decor"],
    icon: "Tag",
  },
  {
    id: "myhome", index: "06", title: "My Home",
    desc: "Keep records, track repairs, store warranties and never miss a payment or renewal.",
    items: ["Records", "Repairs", "Warranties", "Payment Reminders", "Documents"],
    icon: "Home",
  },
];

export const STATS = [
  { value: "48,000+", label: "Properties Listed" },
  { value: "3,200+", label: "Verified Agents" },
  { value: "120k+", label: "Verified Documents" },
  { value: "20+", label: "Cities Across Africa" },
  { value: "0.4s", label: "Avg. Search Speed" },
  { value: "₦900B+", label: "Transactions Secured" },
];

// Pan-African coverage — cities AMASS is expanding across.
export const AFRICAN_CITIES = [
  "Lagos", "Abuja", "Accra", "Nairobi", "Kigali", "Cape Town",
  "Kampala", "Dar es Salaam", "Dakar", "Addis Ababa", "Johannesburg", "Kumasi",
];

export const PROPERTIES = [
  { id: "p1", price: "₦420M", title: "Ocean-View Penthouse", location: "Eko Atlantic, VI", beds: 5, baths: 6, sqm: 610, tag: "Premium", agent: "Adaeze O.", verified: true, image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1200&auto=format&fit=crop" },
  { id: "p2", price: "₦185M", title: "Waterfront Duplex", location: "Banana Island, Ikoyi", beds: 4, baths: 5, sqm: 420, tag: "Available", agent: "Tunde A.", verified: true, image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=1200&auto=format&fit=crop" },
  { id: "p3", price: "₦95M", title: "Smart 3-Bed Apartment", location: "Lekki Phase 1", beds: 3, baths: 3, sqm: 210, tag: "Verified", agent: "Ngozi E.", verified: true, image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=1200&auto=format&fit=crop" },
  { id: "p4", price: "₦260M", title: "Contemporary Terrace", location: "Ikate, Lekki", beds: 4, baths: 4, sqm: 340, tag: "Coming Soon", agent: "Emeka N.", verified: true, image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop" },
  { id: "p5", price: "₦72M", title: "Serviced Short-Let Studio", location: "Victoria Island", beds: 1, baths: 1, sqm: 65, tag: "Short Let", agent: "Bisi K.", verified: true, image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1200&auto=format&fit=crop" },
  { id: "p6", price: "₦310M", title: "Signature Smart Home", location: "Osborne, Ikoyi", beds: 5, baths: 5, sqm: 520, tag: "Premium", agent: "Chidi U.", verified: true, image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?q=80&w=1200&auto=format&fit=crop" },
];

export const STEPS = [
  { n: "01", title: "Discover", desc: "Explore verified listings on an intelligent satellite map." , icon: "Search"},
  { n: "02", title: "Verify", desc: "Confirm documents, ownership and agent identity instantly.", icon: "ShieldCheck" },
  { n: "03", title: "Inspect", desc: "Book physical or virtual tours with a single tap.", icon: "Eye" },
  { n: "04", title: "Chat", desc: "Negotiate securely with verified agents in real time.", icon: "MessagesSquare" },
  { n: "05", title: "Complete", desc: "Close with escrow-protected, secure transactions.", icon: "CheckCircle2" },
];

export const AGENT_BENEFITS = [
  { title: "More Leads", desc: "Reach millions of active, verified property seekers.", icon: "TrendingUp" },
  { title: "Verified Profile", desc: "A trusted blue badge that converts browsers to buyers.", icon: "BadgeCheck" },
  { title: "Property Management", desc: "Manage every listing from one elegant dashboard.", icon: "LayoutDashboard" },
  { title: "Analytics Dashboard", desc: "Understand views, leads and market demand live.", icon: "BarChart3" },
  { title: "Powerful CRM", desc: "Never lose a lead with an intelligent pipeline.", icon: "Users" },
  { title: "Marketing Tools", desc: "Boost, promote and syndicate listings effortlessly.", icon: "Megaphone" },
];

export const PROFESSIONALS = [
  { name: "Electricians", count: "1,200+", icon: "Zap" },
  { name: "Plumbers", count: "980+", icon: "Wrench" },
  { name: "Architects", count: "640+", icon: "PencilRuler" },
  { name: "Builders", count: "1,800+", icon: "HardHat" },
  { name: "Painters", count: "760+", icon: "PaintRoller" },
  { name: "Surveyors", count: "420+", icon: "Ruler" },
  { name: "Interior Designers", count: "530+", icon: "Sofa" },
  { name: "Equipment Vendors", count: "310+", icon: "Truck" },
];

export const HOME_PRODUCTS = [
  { name: "Furniture", price: "from ₦85k", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop" },
  { name: "Kitchen", price: "from ₦40k", image: "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?q=80&w=800&auto=format&fit=crop" },
  { name: "Electronics", price: "from ₦120k", image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?q=80&w=800&auto=format&fit=crop" },
  { name: "Appliances", price: "from ₦95k", image: "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?q=80&w=800&auto=format&fit=crop" },
  { name: "Lighting", price: "from ₦18k", image: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=800&auto=format&fit=crop" },
  { name: "Decoration", price: "from ₦12k", image: "https://images.unsplash.com/photo-1513161455079-7dc1de15ef3e?q=80&w=800&auto=format&fit=crop" },
  { name: "Office", price: "from ₦60k", image: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=800&auto=format&fit=crop" },
];

export const TESTIMONIALS = [
  { name: "Adebayo Ogunlesi", role: "Property Investor · Lagos", quote: "AMASS turned a 3-month search into a weekend. The verification alone saved me from two fraudulent listings.", avatar: "https://images.pexels.com/photos/36053652/pexels-photo-36053652.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop" },
  { name: "Ama Mensah", role: "First-time Buyer · Accra", quote: "I bought my first apartment in East Legon entirely through AMASS. Escrow made the payment feel completely safe.", avatar: "https://images.pexels.com/photos/5999896/pexels-photo-5999896.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop" },
  { name: "Chinedu Okafor", role: "Verified Agent · Abuja", quote: "My leads tripled in the first month. The CRM and analytics are genuinely better than tools I paid for.", avatar: "https://images.pexels.com/photos/13801446/pexels-photo-13801446.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop" },
  { name: "Wanjiru Kamau", role: "Developer · Nairobi", quote: "We sold out a 40-unit development off-plan using AMASS new-development tools. Remarkable reach across Africa.", avatar: "https://images.pexels.com/photos/5905901/pexels-photo-5905901.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop" },
  { name: "Emeka Nwankwo", role: "Construction Co. · Kigali", quote: "Sourcing materials and vetted professionals in one marketplace cut our procurement time in half.", avatar: "https://images.pexels.com/photos/13801474/pexels-photo-13801474.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop" },
];

export const FAQS = [
  { q: "Where is AMASS available across Africa?", a: "AMASS is live in 20+ cities with the deepest inventory in Lagos, Abuja, Accra and Nairobi — and expanding rapidly across the continent." },
  { q: "How does AMASS verify listings?", a: "Every listing passes document checks, ownership validation and agent identity verification before it earns a verified badge." },
  { q: "Are transactions safe?", a: "All payments can move through AMASS Escrow, so funds are only released when both parties meet agreed conditions." },
  { q: "What is AMASS Property Intelligence?", a: "It's our AI + satellite layer delivering valuations, neighbourhood scores, risk analysis and market predictions on any property." },
  { q: "How do I become an AMASS agent?", a: "Tap ‘Become an Agent’, complete verification, and start listing with a full CRM, analytics and marketing suite." },
  { q: "Does AMASS offer financing?", a: "Yes — mortgages, BNPL, property financing and insurance through our vetted financial partners." },
];

export const FOOTER_LINKS = {
  Company: ["About", "Careers", "Blog", "Investors", "Partners"],
  Product: ["Property Search", "Intelligence", "Construction", "Home Market"],
  Developers: ["API", "Documentation", "Status", "Integrations"],
  Support: ["Help Center", "Privacy", "Terms", "Contact"],
};

// Editable CMS defaults (fallback when the backend content is unavailable).
export const HERO_DEFAULT = {
  overline: "The Google Maps of African Real Estate",
  line1: "Discover Africa's",
  line2: "Properties Like",
  line3: "Never Before",
  subheading:
    "The AMASS app lets you search, verify, buy, rent, finance and explore properties with intelligent maps, verified listings and AI-powered property intelligence.",
  ctaPrimary: "Get Early Access",
  ctaSecondary: "Become an Agent",
};

export const SECTIONS_DEFAULT = {
  search: true, marquee: true, categories: true, pillars: true,
  showcase: true, stats: true, howItWorks: true, agents: true,
  constructionPros: true, homeMarketplace: true, mobileApp: true,
  testimonials: true, faq: true, finalCta: true,
};

export const DEFAULT_CONTENT = {
  hero: HERO_DEFAULT,
  trust: TRUST,
  stats: STATS,
  africanCities: AFRICAN_CITIES,
  testimonials: TESTIMONIALS,
  faqs: FAQS,
  sections: SECTIONS_DEFAULT,
};
