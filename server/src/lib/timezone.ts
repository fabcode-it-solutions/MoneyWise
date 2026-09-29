// Resolve "what date/day-of-week is it right now" as observed in an IANA
// timezone, using only the built-in Intl API (no extra tz-database dependency).
export function zonedNowParts(timeZone: string): { y: number; m: number; d: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
  };
}
