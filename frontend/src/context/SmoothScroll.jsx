import React, { useEffect, useRef } from "react";
import Lenis from "lenis";

// Smooth momentum scrolling wrapper.
export default function SmoothScroll({ children }) {
  const lenisRef = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // Allow anchor links / buttons to scroll to sections
    const handleAnchor = (e) => {
      const target = e.detail;
      const el = document.querySelector(target);
      if (el) lenis.scrollTo(el, { offset: -80 });
    };
    window.addEventListener("amass:scrollto", handleAnchor);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      window.removeEventListener("amass:scrollto", handleAnchor);
    };
  }, []);

  return <>{children}</>;
}

export function scrollToSection(selector) {
  window.dispatchEvent(new CustomEvent("amass:scrollto", { detail: selector }));
}
