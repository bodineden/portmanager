import { createHash, timingSafeEqual } from "node:crypto";
import { getJoinedPortfolio } from "@/lib/live-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  // Fixed-size digests avoid length-dependent comparison and timingSafeEqual throws.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const matches = timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret ?? ""}`));
  if (!secret || !authorization || !matches) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const portfolio = await getJoinedPortfolio();
  const recorded = portfolio.snapshotRecordResult ?? "skipped";
  return Response.json({ recorded }, { status: recorded === "recorded" || recorded === "already-exists" ? 200 : 503 });
}
