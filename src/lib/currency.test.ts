import { beforeEach, describe, expect, it, vi } from "vitest";

// api.ts talks to the network and touches svelte state; replace it with a stub.
vi.mock("./api.js", () => ({
  convertCurrency: vi.fn(async (amount: number) => amount),
  fetchCurrencyRates: vi.fn(async () => null),
}));

import {
  getCurrencySymbol,
  formatAmountWithSymbol,
  formatMoney,
  compactCurrencyValue,
  convertToDisplayCurrency,
  convertToDisplayCurrencySync,
  warmConversionRates,
} from "./currency.js";
import { convertCurrency, fetchCurrencyRates } from "./api.js";
import { setCurrencyRates, setLastRateFetch } from "./state.svelte.js";
import { setLocale } from "./i18n.svelte.js";

const mockConvertCurrency = vi.mocked(convertCurrency);
const mockFetchCurrencyRates = vi.mocked(fetchCurrencyRates);

beforeEach(() => {
  setCurrencyRates({});
  setLastRateFetch(0);
  mockConvertCurrency.mockReset();
  mockConvertCurrency.mockImplementation(async (amount: number) => amount);
  mockFetchCurrencyRates.mockReset();
  mockFetchCurrencyRates.mockImplementation(async () => null);
});

describe("getCurrencySymbol", () => {
  it("maps known currencies to symbols", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("EUR")).toBe("€");
    expect(getCurrencySymbol("INR")).toBe("₹");
  });

  it("falls back to the code plus a space for unknown currencies", () => {
    expect(getCurrencySymbol("XYZ")).toBe("XYZ ");
  });
});

describe("formatAmountWithSymbol", () => {
  it("formats with two decimals", () => {
    expect(formatAmountWithSymbol(12.5, "USD")).toBe("$12.50");
    expect(formatAmountWithSymbol(0, "EUR")).toBe("€0.00");
  });
});

describe("compactCurrencyValue", () => {
  it("formats thousands and millions", () => {
    expect(compactCurrencyValue(999, "$")).toBe("$999");
    expect(compactCurrencyValue(1000, "$")).toBe("$1.0k");
    expect(compactCurrencyValue(2500000, "$")).toBe("$2.5M");
    expect(compactCurrencyValue(0, "$")).toBe("$0");
  });
});

describe("warmConversionRates", () => {
  it("fetches only the missing base currencies in parallel", async () => {
    mockFetchCurrencyRates.mockImplementation(async (from?: string) => {
      const base = from ?? "EUR";
      return { USD: 1.2, [base]: 1 };
    });
    await warmConversionRates(["EUR", "EUR", "GBP"], "USD");
    expect(mockFetchCurrencyRates).toHaveBeenCalledTimes(2);
  });

  it("skips network calls when everything is already cached or identical", async () => {
    await warmConversionRates(["USD", "USD"], "USD");
    expect(mockFetchCurrencyRates).not.toHaveBeenCalled();
  });

  it("caches fetched rates for synchronous conversion", async () => {
    mockFetchCurrencyRates.mockImplementation(async () => ({ USD: 1.2 }));
    await warmConversionRates(["EUR"], "USD");
    expect(convertToDisplayCurrencySync(100, "EUR", "USD").amount).toBeCloseTo(120);
  });

  it("does not mark the cache fresh when all fetches are throttled to null", async () => {
    // fetchCurrencyRates returns null under the client's per-currency throttle.
    mockFetchCurrencyRates.mockImplementation(async () => null);
    setLastRateFetch(0);
    await warmConversionRates(["EUR"], "USD");
    expect(convertToDisplayCurrencySync(100, "EUR", "USD").amount).toBe(100);
  });
});

describe("convertToDisplayCurrencySync", () => {
  it("converts using a cached rate", () => {
    setCurrencyRates({ EUR: { USD: 2 } });
    setLastRateFetch(Date.now());
    const out = convertToDisplayCurrencySync(10, "EUR", "USD");
    expect(out.amount).toBe(20);
    expect(out.currency).toBe("USD");
  });

  it("falls back to the original amount when no rate is cached", () => {
    expect(convertToDisplayCurrencySync(10, "EUR", "USD").amount).toBe(10);
  });

  it("treats identical currencies as a 1:1 conversion", () => {
    expect(convertToDisplayCurrencySync(10, "USD", "USD").amount).toBe(10);
  });
});

describe("convertToDisplayCurrency", () => {
  it("delegates to the async converter", async () => {
    mockConvertCurrency.mockImplementation(async (amount: number) => amount * 3);
    const out = await convertToDisplayCurrency(5, "USD", "USD");
    expect(mockConvertCurrency).toHaveBeenCalledWith(5, "USD", "USD");
    expect(out).toEqual({ amount: 15, currency: "USD" });
  });
});

describe("formatMoney locale awareness", () => {
  it("groups with the active locale and switches separators with the language", () => {
    setLocale("en");
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    setLocale("es");
    const es = formatMoney(1234.5, "USD");
    // Node's bundled ICU may omit the es thousands separator, but the decimal
    // separator must become a comma and the output must differ from English.
    expect(es.endsWith(",50")).toBe(true);
    expect(es).not.toBe("$1,234.50");
    setLocale("en");
  });
});
