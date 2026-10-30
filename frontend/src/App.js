import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/context/ThemeProvider";
import SmoothScroll from "@/context/SmoothScroll";
import { LeadFormProvider } from "@/context/LeadFormProvider";
import { ContentProvider, useContent } from "@/context/ContentProvider";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import SearchBar from "@/components/SearchBar";
import CategorySection from "@/components/CategorySection";
import Marquee from "@/components/Marquee";
import Pillars from "@/components/Pillars";
import PropertyShowcase from "@/components/PropertyShowcase";
import Stats from "@/components/Stats";
import HowItWorks from "@/components/HowItWorks";
import Agents from "@/components/Agents";
import ConstructionPros from "@/components/ConstructionPros";
import HomeMarketplace from "@/components/HomeMarketplace";
import MobileApp from "@/components/MobileApp";
import Testimonials from "@/components/Testimonials";
import FAQSection from "@/components/FAQSection";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

function Landing() {
  const { sections } = useContent();
  const on = (key) => sections?.[key] !== false;
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        {on("search") && <SearchBar />}
        {on("marquee") && <Marquee />}
        {on("categories") && <CategorySection />}
        {on("pillars") && <Pillars />}
        {on("showcase") && <PropertyShowcase />}
        {on("stats") && <Stats />}
        {on("howItWorks") && <HowItWorks />}
        {on("agents") && <Agents />}
        {on("constructionPros") && <ConstructionPros />}
        {on("homeMarketplace") && <HomeMarketplace />}
        {on("mobileApp") && <MobileApp />}
        {on("testimonials") && <Testimonials />}
        {on("faq") && <FAQSection />}
        {on("finalCta") && <FinalCTA />}
      </main>
      <Footer />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ContentProvider>
        <LeadFormProvider>
          <SmoothScroll>
            <div className="App bg-background">
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Landing />} />
                </Routes>
              </BrowserRouter>
              <Toaster position="top-center" richColors />
            </div>
          </SmoothScroll>
        </LeadFormProvider>
      </ContentProvider>
    </ThemeProvider>
  );
}

export default App;
