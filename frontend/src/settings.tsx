import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api, getToken } from "@/src/api";
import { Lang, TKey, translate } from "@/src/i18n";
import { storage } from "@/src/utils/storage";
import { audioSeq, playUrl, stopAudio } from "@/src/voice";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  voiceOn: boolean;
  setVoiceOn: (v: boolean) => void;
  autoRead: boolean;
  setAutoRead: (v: boolean) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  speak: (key: TKey, vars?: Record<string, string | number>, extra?: string) => Promise<void>;
  speakText: (text: string) => void;
  voiceMissing: boolean;
};

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [voiceOn, setVoiceState] = useState(true);
  const [autoRead, setAutoState] = useState(false);

  useEffect(() => {
    (async () => {
      setLangState(((await storage.getItem<string>("partner_lang", "en")) as Lang) || "en");
      setVoiceState((await storage.getItem<boolean>("partner_voice", true)) !== false);
      setAutoState((await storage.getItem<boolean>("partner_autoread", false)) === true);
    })();
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    storage.setItem("partner_lang", l);
  };
  const setVoiceOn = (v: boolean) => {
    setVoiceState(v);
    storage.setItem("partner_voice", v);
    if (!v) stopAudio();
  };
  const setAutoRead = (v: boolean) => {
    setAutoState(v);
    storage.setItem("partner_autoread", v);
  };

  // Natural AI voice (server-side OpenAI TTS, cached per phrase) reads every language.
  const voiceMissing = false;
  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const sayId = useRef(0);
  const say = useCallback(
    async (text: string) => {
      if (!voiceOn || !text.trim()) return;
      stopAudio();
      const mine = ++sayId.current;
      const audioAt = audioSeq();
      try {
        const signedIn = !!(await getToken());
        const r = await api<{ url: string }>(signedIn ? "/partner/tts" : "/partner/tts-public", { body: { text: text.slice(0, signedIn ? 1500 : 300), lang }, auth: signedIn });
        if (mine !== sayId.current || audioAt !== audioSeq()) return; // a newer tap, or the screen was left
        await playUrl(r.url);
      } catch {
        // voice is optional help — the screen still works without it
      }
    },
    [voiceOn, lang],
  );

  const speak = useCallback(
    (key: TKey, vars?: Record<string, string | number>, extra?: string) => say(translate(lang, key, vars) + (extra ? `. ${extra}` : "")),
    [lang, say],
  );

  const speakText = useCallback((text: string) => say(text), [say]);

  const value = useMemo(
    () => ({ lang, setLang, voiceOn, setVoiceOn, autoRead, setAutoRead, t, speak, speakText, voiceMissing }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, voiceOn, autoRead, t, speak, speakText, voiceMissing],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error("SettingsProvider missing");
  return c;
}
