import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSettings } from "../hooks/useSWR";
import enMessages from "./messages/en";
import zhMessages from "./messages/zh";

export type AppLanguage = "en" | "zh";
type MessageCatalog = Record<string, string>;
type MessageParams = Record<string, string | number>;

const catalogs: Record<AppLanguage, MessageCatalog> = {
  en: enMessages,
  zh: zhMessages,
};

export type Translate = (key: string, params?: MessageParams) => string;

function resolveLanguage(raw: unknown): AppLanguage {
  return raw === "zh" ? "zh" : "en";
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function translate(locale: AppLanguage, key: string, params?: MessageParams): string {
  const localeCatalog = catalogs[locale];
  const fallbackCatalog = catalogs.en;
  const raw = localeCatalog[key] ?? fallbackCatalog[key] ?? key;
  return interpolate(raw, params);
}

function resolveErrorCodeMessage(t: Translate, errorCode?: string | null): string | null {
  if (!errorCode) return null;
  const directKey = `error.code.${errorCode}`;
  const direct = t(directKey);
  if (direct !== directKey) return direct;

  if (errorCode.startsWith("auth.")) {
    return t("error.code.auth.generic");
  }
  if (errorCode.startsWith("runtime.")) {
    return t("error.code.runtime.generic");
  }
  return t("error.code.generic");
}

type I18nContextValue = {
  locale: AppLanguage;
  setLocale: (locale: AppLanguage) => void;
  t: Translate;
  getErrorMessageByCode: (errorCode?: string | null) => string | null;
};

const defaultTranslate: Translate = (key, params) => translate("zh", key, params);
const defaultContextValue: I18nContextValue = {
  locale: "zh",
  setLocale: () => undefined,
  t: defaultTranslate,
  getErrorMessageByCode: (errorCode?: string | null) =>
    resolveErrorCodeMessage(defaultTranslate, errorCode),
};

const I18nContext = createContext<I18nContextValue>(defaultContextValue);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [locale, setLocaleState] = useState<AppLanguage>("en");

  useEffect(() => {
    setLocaleState(resolveLanguage(settings?.language));
  }, [settings?.language]);

  const setLocale = useCallback((nextLocale: AppLanguage) => {
    setLocaleState(resolveLanguage(nextLocale));
  }, []);

  const t = useCallback<Translate>(
    (key, params) => translate(locale, key, params),
    [locale],
  );

  const getErrorMessageByCode = useCallback(
    (errorCode?: string | null) => resolveErrorCodeMessage(t, errorCode),
    [t],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, getErrorMessageByCode }),
    [locale, setLocale, t, getErrorMessageByCode],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
