import { createContext, useContext } from 'react';
import { bn, type Messages } from './bn';
import { en } from './en';

// Every word on screen comes from bn.ts or en.ts; Bangla is the default.
export type Language = 'bn' | 'en';

const MESSAGES: Record<Language, Messages> = { bn, en };

export const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: 'bn', setLanguage: () => undefined });

export function useText(): Messages {
  return MESSAGES[useContext(LanguageContext).language];
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function isLanguage(value: string | null): value is Language {
  return value === 'bn' || value === 'en';
}

export type { Messages };
