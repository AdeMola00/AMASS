import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Loader() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const finish = () => setDone(true);
    // If the document already finished loading (revisits / fast connections),
    // dismiss on the next microtask — no timer, so it survives tab throttling.
    if (document.readyState === "complete") {
      Promise.resolve().then(finish);
      return;
    }
    window.addEventListener("load", finish);
    // Safety net in case the load event is missed.
    const fallback = setTimeout(finish, 2500);
    return () => {
      window.removeEventListener("load", finish);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          exit={{ y: "-100%" }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-brand-charcoal"
          data-testid="loader"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-emerald text-white">
              <span className="font-display text-2xl font-black">A</span>
            </span>
            <span className="font-display text-3xl font-bold tracking-tight text-white">AMASS</span>
          </motion.div>

          <div className="mt-8 h-[3px] w-56 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full w-1/3 rounded-full bg-brand-emerald"
              style={{ animation: "loaderSlide 1.1s ease-in-out infinite" }}
            />
          </div>
          <style>{`@keyframes loaderSlide{0%{transform:translateX(-120%)}100%{transform:translateX(340%)}}`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
