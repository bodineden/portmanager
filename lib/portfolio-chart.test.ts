import { describe, expect, it } from "vitest";
import { snapshotSeries, pointLabel } from "../app/portfolio/portfolio-chart";

const live = { date: "2026-09-05", asOf: "2026-09-05T12:00:00Z", valueThb: 500, valueUsd: 14 };
const snapshots = [
  { date: "2026-09-05", totalValueThb: 450, totalValueUsd: 12 },
  { date: "2026-09-04", totalValueThb: null, totalValueUsd: 11 },
  { date: "2026-09-03", totalValueThb: 400, totalValueUsd: null },
  { date: "2026-08-05", totalValueThb: 300, totalValueUsd: 9 },
  { date: "2026-06-05", totalValueThb: 200, totalValueUsd: 6 },
  { date: "2026-03-05", totalValueThb: 100, totalValueUsd: 3 },
  { date: "2026-03-04", totalValueThb: 0, totalValueUsd: 0 },
];

describe("portfolio snapshot series presentation", () => {
  it("sorts newest-first records chronologically, omits null THB and uses the live point once", () => {
    const before = structuredClone(snapshots);
    const points = snapshotSeries(snapshots, live, "ALL");
    expect(points.map((point) => point.date)).toEqual(["2026-03-04", "2026-03-05", "2026-06-05", "2026-08-05", "2026-09-03", "2026-09-05"]);
    expect(points.at(-1)).toMatchObject(live);
    expect(points[0].valueThb).toBe(0);
    expect(snapshots).toEqual(before);
  });
  it("keeps the stored same-day observation when the live THB total is unavailable", () => {
    const points = snapshotSeries(snapshots, { ...live, valueThb: null }, "ALL");
    expect(points.at(-1)).toMatchObject({ date: live.date, valueThb: 450, valueUsd: 12 });
    expect(new Set(points.map((point) => point.date)).size).toBe(points.length);
  });
  it.each([["1M", 3], ["3M", 4], ["6M", 5], ["ALL", 6]] as const)("filters %s inclusively using the UTC month cutoff", (range, count) => {
    expect(snapshotSeries(snapshots, live, range)).toHaveLength(count);
  });
  it("has an honest empty series only when neither a recorded THB day nor live THB is available", () => {
    expect(snapshotSeries([], { ...live, valueThb: null }, "ALL")).toEqual([]);
    expect(snapshotSeries([], live, "ALL")).toEqual([live]);
  });
  it("never plots duplicate stored dates", () => {
    const points = snapshotSeries([snapshots[2], ...snapshots], live, "ALL");
    expect(new Set(points.map((point) => point.date)).size).toBe(points.length);
  });
  it("prints THB first and only recorded USD without inferring an exchange rate", () => {
    expect(pointLabel({ date: "2026-09-03", valueThb: 400, valueUsd: null })).toBe("03 Sept 2026 · ฿400");
    expect(pointLabel({ date: "2026-09-03", valueThb: 400, valueUsd: 12.34 })).toBe("03 Sept 2026 · ฿400 · US$12.34");
    expect(pointLabel({ date: "2026-09-03", valueThb: 0, valueUsd: 0 })).toBe("03 Sept 2026 · ฿0 · US$0.00");
  });
});
