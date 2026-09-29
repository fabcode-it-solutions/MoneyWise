function createSlidingWindow(windowMs: number) {
  const logs = new Map<string, number[]>();
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of logs) {
      const recent = timestamps.filter(t => t > cutoff);
      if (recent.length === 0) logs.delete(key);
      else logs.set(key, recent);
    }
  }, 60_000);
  if (cleanup.unref) cleanup.unref();

  return {
    allow(key: string, maxRequests: number): boolean {
      const now = Date.now();
      const cutoff = now - windowMs;
      const timestamps = logs.get(key) ?? [];
      const recent = timestamps.filter(t => t > cutoff);
      if (recent.length >= maxRequests) {
        logs.set(key, recent);
        return false;
      }
      recent.push(now);
      logs.set(key, recent);
      return true;
    },
  };
}

export const userBurstLimiter = createSlidingWindow(60_000);
export const groqSlidingLimiter = createSlidingWindow(60_000);

let activeGroqRequests = 0;
export const MAX_CONCURRENT_GROQ = 5;

export function acquireGroqSlot(): boolean {
  if (activeGroqRequests >= MAX_CONCURRENT_GROQ) return false;
  activeGroqRequests++;
  return true;
}

export function releaseGroqSlot(): void {
  if (activeGroqRequests > 0) activeGroqRequests--;
}

export function getActiveGroqCount(): number {
  return activeGroqRequests;
}
