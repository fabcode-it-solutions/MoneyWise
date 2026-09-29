import { currencySymbols } from './constants.js';
import { convertCurrency, fetchCurrencyRates } from './api.js';
import { RATE_CACHE_DURATION } from './constants.js';
import { getCurrencyRates, setCurrencyRates, getLastRateFetch, setLastRateFetch } from './state.svelte.js';
import { formatNumber } from './i18n.svelte.js';

export function getCurrencySymbol(currency: string): string {
  return currencySymbols[currency] || currency + ' ';
}

/** Locale-aware money formatting: symbol + grouped/separated number. */
export function formatMoney(amount: number, currency: string): string {
  return `${getCurrencySymbol(currency)}${formatNumber(amount)}`;
}

export function formatAmountWithSymbol(amount: number, currency: string): string {
  return formatMoney(amount, currency);
}

export async function convertToDisplayCurrency(amount: number, originalCurrency: string, displayCurrency: string): Promise<{ amount: number; currency: string }> {
  const convertedAmount = await convertCurrency(amount, originalCurrency, displayCurrency);
  return { amount: convertedAmount, currency: displayCurrency };
}

function getCachedRate(fromCurrency: string, toCurrency: string): number | null {
  if (fromCurrency === toCurrency) return 1;
  const rates = getCurrencyRates()[fromCurrency];
  if (rates && Date.now() - getLastRateFetch() < RATE_CACHE_DURATION) {
    return rates[toCurrency] ?? null;
  }
  return null;
}

// Ensures every currency in `fromCurrencies` has a cached rate to
// `toCurrency` before a bulk calculation runs its (synchronous) math loop.
// Fetches all cache misses in parallel instead of the loop awaiting one
// currency conversion at a time.
export async function warmConversionRates(fromCurrencies: Iterable<string>, toCurrency: string): Promise<void> {
  const missing = [...new Set(fromCurrencies)].filter(from => from !== toCurrency && getCachedRate(from, toCurrency) === null);
  if (missing.length === 0) return;

  const results = await Promise.all(missing.map(async from => ({ from, rates: await fetchCurrencyRates(from) })));
  const fetched = results.filter(r => r.rates);
  // Nothing to persist — e.g. every currency in this batch lost the race to
  // a concurrent warmConversionRates() call for the same currency and got
  // fetchCurrencyRates()'s per-currency throttle (null) instead of rates.
  // Writing state here unconditionally would keep marking the cache "just
  // refreshed" without it actually holding the missing rate, which reruns
  // any effect that read this state, which calls back in here — a loop.
  if (fetched.length === 0) return;

  let updated = getCurrencyRates();
  for (const { from, rates } of fetched) {
    updated = { ...updated, [from]: rates };
  }
  setCurrencyRates(updated);
  setLastRateFetch(Date.now());
}

// Synchronous conversion for use after warmConversionRates() has resolved.
// Falls back to the original amount if a rate still isn't available, same
// as the async convertCurrency()'s no-rate fallback.
export function convertToDisplayCurrencySync(amount: number, originalCurrency: string, displayCurrency: string): { amount: number; currency: string } {
  const rate = getCachedRate(originalCurrency, displayCurrency);
  return { amount: rate != null ? amount * rate : amount, currency: displayCurrency };
}

export function compactCurrencyValue(value: number, symbol: string): string {
  if (value >= 1000000) return `${symbol}${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${symbol}${(value / 1000).toFixed(1)}k`;
  return `${symbol}${value.toFixed(0)}`;
}
