import * as Speech from "expo-speech";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Lang, LANGS, TKey, translate } from "@/src/i18n";
import { storage } from "@/src/utils/storage";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  voiceOn: boolean;
  setVoiceOn: (v: boolean) => void;
  autoRead: boolean;
  setAutoRead: (v: boolean) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  speak: (key: TKey, vars?: Record<string, string | number>, extra?: string) => void;
  speakText: (text: string) => void;
  voiceMissing: boolean;
};

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [voiceOn, setVoiceState] = useState(true);
  const [autoRead, setAutoState] = useState(false);
  const [voices, setVoices] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLangState(((await storage.getItem<string>("partner_lang", "en")) as Lang) || "en");
      setVoiceState((await storage.getItem<boolean>("partner_voice", true)) !== false);
      setAutoState((await storage.getItem<boolean>("partner_autoread", false)) === true);
      try {
        const v = await Speech.getAvailableVoicesAsync();
        setVoices(v.map((x) => (x.language || "").toLowerCase()));
      } catch {}
    })();
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    storage.setItem("partner_lang", l);
  };
  const setVoiceOn = (v: boolean) => {
    setVoiceState(v);
    storage.setItem("partner_voice", v);
    if (!v) Speech.stop();
  };
  const setAutoRead = (v: boolean) => {
    setAutoState(v);
    storage.setItem("partner_autoread", v);
  };

  const code = LANGS.find((l) => l.code === lang)?.voice ?? null;
  const hasVoice = !!code && voices.some((v) => v.startsWith(code));
  // Pidgin is written in English letters, an English voice reads it well.
  const voiceMissing = (lang === "yo" || lang === "ha" || lang === "ig") && !hasVoice;
  const spokenLang: Lang = voiceMissing ? "en" : lang;

  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const say = useCallback(
    (text: string, language: string) => {
      if (!voiceOn || !text) return;
      Speech.stop();
      Speech.speak(text, { language, rate: 0.92 });
    },
    [voiceOn],
  );

  const speak = useCallback(
    (key: TKey, vars?: Record<string, string | number>, extra?: string) => {
      const text = translate(spokenLang, key, vars) + (extra ? `. ${extra}` : "");
      say(text, spokenLang === "en" || spokenLang === "pcm" ? "en-NG" : `${code}-NG`);
    },
    [spokenLang, code, say],
  );

  const speakText = useCallback((text: string) => say(text, hasVoice && code && lang !== "en" ? `${code}-NG` : "en-NG"), [say, hasVoice, code, lang]);

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
