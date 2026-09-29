import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  // Compiles Svelte 5 runes in .svelte.ts modules (e.g. state.svelte.ts) that
  // the pure-logic helpers import.
  plugins: [svelte()],
  test: {
    // jsdom provides window/localStorage/canvas for chart and state modules.
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
