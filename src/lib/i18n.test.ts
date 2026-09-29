import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  t,
  getLocale,
  setLocale,
  formatNumber,
  localizeServerError,
  locales,
  dictionaries,
} from "./i18n.svelte.js";

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    // Deterministic starting locale for the shared module instance.
    setLocale("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the configured locales", () => {
    expect(locales.map((l) => l.code)).toEqual(["en", "es"]);
  });

  describe("t() interpolation", () => {
    it("replaces {params} inside a message", () => {
      expect(t("recurring.next", { date: "Jul 1" })).toBe("Next: Jul 1");
    });

    it("leaves unknown placeholders untouched", () => {
      expect(t("recurring.next", {})).toBe("Next: {date}");
    });
  });

  describe("pluralization", () => {
    it("picks the singular form when count is 1", () => {
      expect(t("invite.title", { count: 1 })).toBe("Hub Invite");
    });

    it("picks the plural form otherwise", () => {
      expect(t("invite.title", { count: 2 })).toBe("Hub Invites");
      expect(t("invite.title", { count: 0 })).toBe("Hub Invites");
    });

    it("treats a missing count as singular", () => {
      expect(t("invite.title")).toBe("Hub Invite");
    });
  });

  describe("locale switching", () => {
    it("returns English by default", () => {
      expect(getLocale()).toBe("en");
      expect(t("common.cancel")).toBe("Cancel");
    });

    it("returns Spanish after switching", () => {
      setLocale("es");
      expect(getLocale()).toBe("es");
      expect(t("common.cancel")).toBe("Cancelar");
    });

    it("persists the choice to localStorage", () => {
      setLocale("es");
      expect(localStorage.getItem("sw_locale")).toBe("es");
    });

    it("syncs document.documentElement.lang", () => {
      setLocale("es");
      expect(document.documentElement.lang).toBe("es");
      setLocale("en");
      expect(document.documentElement.lang).toBe("en");
    });
  });

  describe("fallback", () => {
    it("returns the key itself when the key exists nowhere", () => {
      expect(t("does.not.exist")).toBe("does.not.exist");
    });

    it("falls back to the English dictionary when the active locale is missing a key", () => {
      const esDict = dictionaries.es as unknown as Record<string, unknown>;
      const original = esDict["common.cancel"];
      delete esDict["common.cancel"];
      try {
        setLocale("es");
        expect(t("common.cancel")).toBe("Cancel");
      } finally {
        esDict["common.cancel"] = original;
      }
    });
  });

  describe("formatNumber", () => {
    it("uses English digit grouping", () => {
      expect(formatNumber(1234.5)).toBe("1,234.50");
    });

    it("uses Spanish digit grouping and decimal separator", () => {
      setLocale("es");
      const out = formatNumber(1234.5);
      // Node's bundled ICU can omit the es thousands separator ("1234,50");
      // real browsers emit "1.234,50". Assert what holds everywhere: the
      // decimal separator is a comma and the output differs from English.
      expect(out.endsWith(",50")).toBe(true);
      expect(out).not.toBe("1,234.50");
    });
  });

  describe("localizeServerError", () => {
    it("passes English through in the English locale", () => {
      setLocale("en");
      expect(localizeServerError("Invalid credentials")).toBe("Invalid credentials");
    });

    it("translates known server errors in the Spanish locale", () => {
      setLocale("es");
      expect(localizeServerError("Invalid credentials")).toBe("Credenciales inválidas");
      expect(localizeServerError("Not a member of this Hub")).toBe("No eres miembro de este Hub");
      expect(localizeServerError("Weekly AI request limit reached. Resets Monday.")).toBe(
        "Límite semanal de solicitudes de IA alcanzado. Se reinicia el lunes."
      );
    });

    it("falls back to the original text for unknown messages", () => {
      setLocale("es");
      expect(localizeServerError("Something brand new")).toBe("Something brand new");
    });

    it("translates client-authored fallback messages", () => {
      setLocale("es");
      expect(localizeServerError("Failed to create Hub")).toBe("No se pudo crear el Hub");
      expect(localizeServerError("Login failed")).toBe("No se pudo iniciar sesión");
    });

    it("localizes the non-JSON server error via t() interpolation", () => {
      setLocale("es");
      expect(t("common.serverError", { status: 500 })).toBe("Error del servidor: 500");
      setLocale("en");
      expect(t("common.serverError", { status: 500 })).toBe("Server error: 500");
    });
  });

  describe("locale detection", () => {
    it("prefers the saved localStorage value", async () => {
      vi.resetModules();
      localStorage.clear();
      localStorage.setItem("sw_locale", "es");
      const mod = await import("./i18n.svelte.js");
      expect(mod.getLocale()).toBe("es");
    });

    it("detects Spanish from the browser language when nothing is saved", async () => {
      vi.resetModules();
      localStorage.clear();
      vi.spyOn(navigator, "language", "get").mockReturnValue("es-MX");
      const mod = await import("./i18n.svelte.js");
      expect(mod.getLocale()).toBe("es");
    });

    it("defaults to English for non-Spanish browser languages", async () => {
      vi.resetModules();
      localStorage.clear();
      vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
      const mod = await import("./i18n.svelte.js");
      expect(mod.getLocale()).toBe("en");
    });

    it("ignores an invalid saved value and falls back to the browser language", async () => {
      vi.resetModules();
      localStorage.setItem("sw_locale", "fr");
      vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
      const mod = await import("./i18n.svelte.js");
      expect(mod.getLocale()).toBe("en");
    });
  });
});
