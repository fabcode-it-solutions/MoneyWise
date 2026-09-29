// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderPieChart, renderTrendChart } from "./charts.js";
import type { CategoryData, TrendPoint } from "../types.js";

/** A canvas 2D context that records calls and tolerates property sets. */
function mockContext(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop in t) return t[prop];
      return vi.fn();
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (contextId: string) => (contextId === "2d" ? (mockContext() as unknown as RenderingContext) : null)
  );
});

const pieData: CategoryData[] = [
  { category: "Food & Dining", amount: 90, percentage: 60 },
  { category: "Transportation", amount: 60, percentage: 40 },
];

describe("renderPieChart", () => {
  it("renders legend entries with percentages and the total in the center", () => {
    const canvas = document.createElement("canvas");
    const { legendHtml, centerText } = renderPieChart(canvas, pieData, 150, "USD");
    expect(legendHtml).toContain("Food & Dining");
    expect(legendHtml).toContain("Transportation");
    expect(legendHtml).toContain("60.0%");
    expect(legendHtml).toContain("40.0%");
    expect(centerText).toBe("$150.00");
  });

  it("renders an empty state when there is no data", () => {
    const canvas = document.createElement("canvas");
    const { legendHtml, centerText } = renderPieChart(canvas, [], 0, "USD");
    expect(legendHtml).toBe("");
    expect(centerText).toBe("$0.00");
  });
});

describe("renderTrendChart", () => {
  const points: TrendPoint[] = [
    { key: "2026-01-01", label: "Jan 1", amount: 40 },
    { key: "2026-01-02", label: "Jan 2", amount: 60 },
  ];

  it("draws a series and reports totals", () => {
    const canvas = document.createElement("canvas");
    const out = renderTrendChart(canvas, points, 100, 50, "This Month", "USD");
    expect(out.isEmpty).toBe(false);
    expect(out.totalText).toBe("$100.00");
    expect(out.avgText).toBe("Avg $50.00");
    expect(out.label).toBe("This Month");
  });

  it("renders the empty state for an empty series", () => {
    const canvas = document.createElement("canvas");
    const out = renderTrendChart(canvas, [], 0, 0, "This Month", "USD");
    expect(out.isEmpty).toBe(true);
    expect(out.totalText).toBe("$0.00");
  });
});
