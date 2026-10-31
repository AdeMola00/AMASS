import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const POLL_MS = 30000;
const LeadAlertsContext = createContext({ unseen: 0, markSeen: async () => null });

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1318].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.16;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch { /* audio not available */ }
}

export function LeadAlertsProvider({ children }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const enabled = can("leads", "view");
  const [unseen, setUnseen] = useState(0);
  const lastCount = useRef(null);

  const check = useCallback(async () => {
    try {
      const { data } = await api.get("/website/leads/unseen");
      if (lastCount.current !== null && data.count > lastCount.current) {
        const who = data.latest[0]?.name || data.latest[0]?.email || "Someone";
        playChime();
        toast.success(`New website lead from ${who}`, {
          action: { label: "View", onClick: () => navigate("/admin/website-leads") },
        });
      }
      lastCount.current = data.count;
      setUnseen(data.count);
    } catch { /* keep last known count */ }
  }, [navigate]);

  useEffect(() => {
    if (!enabled) { return undefined; }
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, check]);

  const markSeen = useCallback(async () => {
    const { data } = await api.post("/website/leads/mark-seen");
    lastCount.current = 0;
    setUnseen(0);
    return data.previous_seen_at;
  }, []);

  return <LeadAlertsContext.Provider value={{ unseen, markSeen }}>{children}</LeadAlertsContext.Provider>;
}

export const useLeadAlerts = () => useContext(LeadAlertsContext);
