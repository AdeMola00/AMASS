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
    id: "m1", status: "available", top: "28%", left: "22%", delay: 0.2,
    price: "₦185M", title: "4-Bed Waterfront Duplex", address: "Banana Island, Ikoyi",
    beds: 4, baths: 5, sqm: 420, type: "Duplex", verified: true,
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m2", status: "premium", top: "42%", left: "58%", delay: 0.8,
    price: "₦420M", title: "Penthouse with Ocean View", address: "Eko Atlantic, VI",
    beds: 5, baths: 6, sqm: 610, type: "Penthouse", verified: true,
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m3", status: "verified", top: "60%", left: "34%", delay: 1.4,
    price: "₦95M", title: "Smart 3-Bed Apartment", address: "Lekki Phase 1",
    beds: 3, baths: 3, sqm: 210, type: "Apartment", verified: true,
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m4", status: "coming_soon", top: "34%", left: "77%", delay: 2.0,
    price: "₦260M", title: "New Development · Terraces", address: "Ikate, Lekki",
    beds: 4, baths: 4, sqm: 340, type: "Terrace", verified: false,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m5", status: "sold", top: "66%", left: "68%", delay: 2.6,
    price: "₦140M", title: "Detached Family Home", address: "Osborne, Ikoyi",
    beds: 4, baths: 4, sqm: 380, type: "Detached", verified: true,
    image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: "m6", status: "available", top: "50%", left: "14%", delay: 3.2,
    price: "₦72M", title: "Serviced Studio · Short Let", address: "Victoria Island",
    beds: 1, baths: 1, sqm: 65, type: "Studio", verified: true,
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=800&auto=format&fit=crop",
  },
];

export const MARKER_LEGEND = [
  { status: "available", label: "Available", color: "var(--m-available)" },
  { status: "coming_soon", label: "Coming Soon", color: "var(--m-coming)" },
  { status: "verified", label: "Verified", color: "var(--m-verified)" },
  { status: "premium", label: "Premium", color: "var(--m-premium)" },
  { status: "sold", label: "Sold", color: "var(--m-sold)" },
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
    desc: "Buy, sell, rent, lease — from luxury homes and commercial to land and short lets.",
    items: ["Buy", "Sell", "Rent", "Lease", "Commercial", "Land", "Short Let", "Luxury Homes"],
    icon: "Building2",
  },
  {
    id: "intelligence", index: "02", title: "Property Intelligence",
    desc: "Satellite discovery, verification and analytics that turn guesswork into certainty.",
    items: ["Satellite Discovery", "Verification", "Market Analytics", "Valuation", "Ownership Insights", "Neighbourhood Intel", "Investment Analysis"],
    icon: "Satellite",
  },
  {
    id: "construction", index: "03", title: "Construction Marketplace",
    desc: "Everything to build — materials, equipment and vetted professionals in one place.",
    items: ["Building Materials", "Equipment Rental", "Professionals", "Architects", "Engineers", "Surveyors", "Interior Designers", "Project Mgmt"],
    icon: "HardHat",
  },
  {
    id: "home", index: "04", title: "Home Marketplace",
    desc: "Furnish and finish your space with curated furniture, appliances and decor.",
    items: ["Furniture", "Appliances", "Electronics", "Kitchen", "Garden", "Decoration", "Office", "Lifestyle"],
    icon: "Sofa",
  },
  {
    id: "ai", index: "05", title: "AI Services",
    desc: "An intelligent copilot for search, valuation, risk and market predictions.",
    items: ["AI Search", "Investment Assistant", "AI Valuation", "Recommendations", "Risk Analysis", "Neighbourhood Score", "Predictions"],
    icon: "Sparkles",
  },
  {
    id: "finance", index: "06", title: "Financial Services",
    desc: "Mortgages, BNPL, financing and escrow — secure money movement, end to end.",
    items: ["Mortgage", "BNPL", "Financing", "Loans", "Insurance", "Escrow", "Secure Payments"],
    icon: "Landmark",
  },
];

export const STATS = [
  { value: "48,000+", label: "Properties Listed" },
  { value: "3,200+", label: "Verified Agents" },
  { value: "120k+", label: "Verified Documents" },
  { value: "36 States", label: "Nationwide Coverage" },
  { value: "0.4s", label: "Avg. Search Speed" },
  { value: "₦900B+", label: "Transactions Secured" },
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
  { name: "Adebayo Ogunlesi", role: "Property Investor", quote: "AMASS turned a 3-month search into a weekend. The verification alone saved me from two fraudulent listings.", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop" },
  { name: "Fatima Bello", role: "First-time Buyer", quote: "I bought my first apartment in Lekki entirely through AMASS. Escrow made the payment feel completely safe.", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop" },
  { name: "Chinedu Okafor", role: "Verified Agent", quote: "My leads tripled in the first month. The CRM and analytics are genuinely better than tools I paid for.", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&auto=format&fit=crop" },
  { name: "Zainab Yusuf", role: "Developer", quote: "We sold out a 40-unit development off-plan using AMASS new-development tools. Remarkable reach.", avatar: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?q=80&w=400&auto=format&fit=crop" },
  { name: "Emeka Nwankwo", role: "Construction Co.", quote: "Sourcing materials and vetted professionals in one marketplace cut our procurement time in half.", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=400&auto=format&fit=crop" },
];

export const FAQS = [
  { q: "Is AMASS available across Nigeria?", a: "Yes. AMASS covers all 36 states with the deepest inventory in Lagos, Abuja and Port Harcourt, expanding across Africa." },
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
