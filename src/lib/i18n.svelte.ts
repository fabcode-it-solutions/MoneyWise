import { en } from "./i18n/en.js";
import { es, serverErrors as esServerErrors } from "./i18n/es.js";
import type { Dict, Message } from "./i18n/types.js";

export type Locale = "en" | "es";

export interface LocaleOption {
  code: Locale;
  /** Native name shown in the language switcher. */
  label: string;
}

export const locales: LocaleOption[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export const dictionaries: Record<Locale, Dict> = { en, es };

const STORAGE_KEY = "sw_locale";

function detectLocale(): Locale {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  }
  if (typeof navigator !== "undefined") {
    return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
  }
  return "en";
}

let locale = $state<Locale>(detectLocale());

function syncDocumentLang() {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}
syncDocumentLang();

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next);
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

/** Human-readable language name for a locale code (server prompt use). */
export function localeName(l: Locale): string {
  return l === "es" ? "Spanish" : "English";
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

function resolveMessage(key: string): Message {
  const dict = dictionaries[locale] ?? en;
  return dict[key] ?? en[key] ?? key;
}

/**
 * Translate a key for the active locale.
 *
 * - Interpolation: `t("welcome", { name: "Ana" })` for `"Welcome {name}"`.
 * - Pluralization: messages stored as `{ one, other }` pick `one` when
 *   `params.count === 1`, `other` otherwise.
 *
 * Reads the reactive `locale` state, so calling it inside a Svelte template,
 * `$derived`, or `$effect` re-runs automatically when the language changes.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const message = resolveMessage(key);
  if (typeof message === "string") return interpolate(message, params);
  const count = params && params.count !== undefined ? Number(params.count) : 1;
  return interpolate(count === 1 ? message.one : message.other, params);
}

/** Format a number with the active locale's digit grouping and separators. */
export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// Server-originated error messages are English; map them to the active UI
// language before display. Missing entries fall back to the original text.
const serverErrorMaps: Partial<Record<Locale, Record<string, string>>> = {
  es: esServerErrors,
};

/** Localize a server error message for the active locale, if known. */
export function localizeServerError(message: string): string {
  return serverErrorMaps[locale]?.[message] ?? message;
}
