import { createContext, useContext, useState, ReactNode } from "react";
import { Lang, translations, Tr } from "@/lib/i18n";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  tr: Tr;
}

const LangContext = createContext<LangContextValue>({
  lang: "zh",
  setLang: () => {},
  tr: translations.zh,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("zh");
  return (
    <LangContext.Provider value={{ lang, setLang, tr: translations[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
