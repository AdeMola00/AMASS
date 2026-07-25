import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/context/ThemeProvider";
import SmoothScroll from "@/context/SmoothScroll";
import { LeadFormProvider } from "@/context/LeadFormProvider";

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
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <SearchBar />
        <Marquee />
        <CategorySection />
        <Pillars />
        <PropertyShowcase />
        <Stats />
        <HowItWorks />
        <Agents />
        <ConstructionPros />
        <HomeMarketplace />
        <MobileApp />
        <Testimonials />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}

export default App;
