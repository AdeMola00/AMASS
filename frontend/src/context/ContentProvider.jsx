import React, { createContext, useContext, useEffect, useState } from "react";
import { API } from "@/lib/api";
import axios from "axios";
import { DEFAULT_CONTENT, SECTIONS_DEFAULT, HERO_DEFAULT } from "@/data/content";

const ContentContext = createContext(DEFAULT_CONTENT);

export function ContentProvider({ children }) {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    let active = true;
    axios
      .get(`${API}/content`)
      .then((r) => {
        if (!active || !r.data) return;
        const d = r.data;
        setContent({
          hero: { ...HERO_DEFAULT, ...(d.hero || {}) },
          trust: d.trust?.length ? d.trust : DEFAULT_CONTENT.trust,
          stats: d.stats?.length ? d.stats : DEFAULT_CONTENT.stats,
          africanCities: d.africanCities?.length ? d.africanCities : DEFAULT_CONTENT.africanCities,
          testimonials: d.testimonials?.length ? d.testimonials : DEFAULT_CONTENT.testimonials,
          faqs: d.faqs?.length ? d.faqs : DEFAULT_CONTENT.faqs,
          sections: { ...SECTIONS_DEFAULT, ...(d.sections || {}) },
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

export const useContent = () => useContext(ContentContext);
