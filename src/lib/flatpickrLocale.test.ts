import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "./i18n.svelte.js";
import { getFlatpickrLocale, _clearFlatpickrLocaleCache } from "./flatpickrLocale.js";

/** Shape of the flatpickr module as consumed by the helper. */
const fp = { l10ns: { default: { months: { longhand: ["January"] } } } };

describe("getFlatpickrLocale", () => {
  beforeEach(() => {
    _clearFlatpickrLocaleCache();
    setLocale("en");
  });

  it("returns the English locale for the en UI", async () => {
    const locale = await getFlatpickrLocale(fp as never);
    expect(locale).toBe(fp.l10ns.default);
  });

  it("returns the Spanish locale for the es UI", async () => {
    setLocale("es");
    const locale = (await getFlatpickrLocale(fp as never)) as {
      months: { longhand: string[] };
      firstDayOfWeek?: number;
    };
    expect(locale.months.longhand).toContain("Enero");
    expect(locale.firstDayOfWeek).toBe(1);
  });

  it("falls back to the English locale when the Spanish module cannot be loaded", async () => {
    setLocale("es");
    const loader = async () => {
      throw new Error("module unavailable");
    };
    const locale = await getFlatpickrLocale(fp as never, loader);
    expect(locale).toBe(fp.l10ns.default);
  });

  it("caches the loaded Spanish locale across calls", async () => {
    setLocale("es");
    const loader = async () => ({ Spanish: { months: { longhand: ["Enero"] } } });
    const first = await getFlatpickrLocale(fp as never, loader);
    await getFlatpickrLocale(fp as never, loader);
    expect(first).toEqual({ months: { longhand: ["Enero"] } });
  });
});
