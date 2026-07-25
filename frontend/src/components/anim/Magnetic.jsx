import React, { useRef } from "react";
import { motion } from "framer-motion";

// Magnetic button/wrapper — subtle pull toward cursor.
export default function Magnetic({ children, strength = 0.35, className = "" }) {
  const ref = useRef(null);

  const handleMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) * strength;
    const y = (e.clientY - (rect.top + rect.height / 2)) * strength;
    el.style.transform = `translate(${x}px, ${y}px)`;
  };

  const reset = () => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0px, 0px)";
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      className={className}
      style={{ transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1)", display: "inline-block" }}
    >
      {children}
    </motion.div>
  );
}
