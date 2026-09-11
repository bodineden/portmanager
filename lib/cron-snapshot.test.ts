import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getJoinedPortfolio } from "./live-data";
import { GET, dynamic } from "../app/api/cron/snapshot/route";
import { config } from "../proxy";
vi.mock("./live-data", () => ({ getJoinedPortfolio: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("authenticated daily snapshot cron", () => {
  it("rejects missing, wrong, different length, wrong case and absent configured secrets before IO", async () => {
    vi.stubEnv("CRON_SECRET", "fixture-secret-only");
    for (const header of [null, "Bearer nope", "Bearer fixture-secret-onlY", "bearer fixture-secret-only", "Bearer undefined"]) {
      const response = await GET(new Request("http://localhost/api/cron/snapshot", { headers: header ? { Authorization: header } : {} }));
      expect(response.status).toBe(401);
    }
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("http://localhost/api/cron/snapshot", { headers: { Authorization: "Bearer " } }))).status).toBe(401);
    expect(getJoinedPortfolio).not.toHaveBeenCalled();
  });
  it("returns the actual recorder result, not a second write or an invented true", async () => {
    vi.stubEnv("CRON_SECRET", "fixture-secret-only");
    for (const result of ["recorded", "already-exists", "skipped", "error"] as const) {
      vi.mocked(getJoinedPortfolio).mockResolvedValue({ snapshotRecordResult: result } as Awaited<ReturnType<typeof getJoinedPortfolio>>);
      const response = await GET(new Request("http://localhost/api/cron/snapshot", { headers: { Authorization: "Bearer fixture-secret-only" } }));
      expect(await response.json()).toEqual({ recorded: result });
      expect(response.status).toBe(result === "recorded" || result === "already-exists" ? 200 : 503);
    }
    expect(getJoinedPortfolio).toHaveBeenCalledTimes(4);
    expect(dynamic).toBe("force-dynamic");
  });
  it("schedules 01:00 UTC and bypasses only cron auth without cookie or session imports", () => {
    expect(JSON.parse(readFileSync("vercel.json", "utf8"))).toEqual({ crons: [{ path: "/api/cron/snapshot", schedule: "0 1 * * *" }] });
    const route = readFileSync("app/api/cron/snapshot/route.ts", "utf8");
    expect(route).toContain("timingSafeEqual");
    expect(route).not.toMatch(/next\/headers|requireSession|cookies\(/);
    expect(readFileSync("proxy.ts", "utf8")).toContain("api/auth|api/cron(?:/|$)|");
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/api/cron", "/api/cron/snapshot"]) expect(matcher.test(path)).toBe(false);
    for (const path of ["/api/crony", "/api/cron-other", "/asset-list", "/portfolio"]) expect(matcher.test(path)).toBe(true);
  });
});
