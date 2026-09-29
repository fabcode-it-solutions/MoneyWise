import { describe, expect, it } from "vitest";
import {
  userBurstLimiter,
  groqSlidingLimiter,
  acquireGroqSlot,
  releaseGroqSlot,
  getActiveGroqCount,
  MAX_CONCURRENT_GROQ,
} from "../src/middleware/groqRateLimiter.js";

describe("sliding window burst limiter", () => {
  it("allows up to the configured burst and rejects beyond it", () => {
    const key = `burst-${Date.now()}-${Math.random()}`;
    let allowed = 0;
    for (let i = 0; i < 40; i++) {
      if (userBurstLimiter.allow(key, 30)) allowed++;
    }
    expect(allowed).toBe(30);
  });

  it("tracks independent windows per key", () => {
    const a = `a-${Date.now()}`;
    const b = `b-${Date.now()}`;
    for (let i = 0; i < 30; i++) userBurstLimiter.allow(a, 30);
    expect(userBurstLimiter.allow(a, 30)).toBe(false);
    expect(userBurstLimiter.allow(b, 30)).toBe(true);
  });
});

describe("Groq concurrency slots", () => {
  it("caps concurrent AI requests at MAX_CONCURRENT_GROQ", () => {
    const acquired: boolean[] = [];
    for (let i = 0; i < MAX_CONCURRENT_GROQ + 3; i++) {
      acquired.push(acquireGroqSlot());
    }
    expect(acquired.filter(Boolean)).toHaveLength(MAX_CONCURRENT_GROQ);
    expect(acquired.slice(MAX_CONCURRENT_GROQ).every((v) => v === false)).toBe(true);
    expect(getActiveGroqCount()).toBe(MAX_CONCURRENT_GROQ);

    releaseGroqSlot();
    expect(acquireGroqSlot()).toBe(true);
    expect(getActiveGroqCount()).toBe(MAX_CONCURRENT_GROQ);

    // Drain back to zero so module state is clean for other tests.
    while (getActiveGroqCount() > 0) releaseGroqSlot();
  });
});
