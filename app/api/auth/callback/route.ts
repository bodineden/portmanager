import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSessionCookie,
  exchangeCodeForEmail,
  isAllowedEmail,
  sessionCookieOptions,
  VERIFIER_COOKIE_NAME,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/auth/callback — exchange the code, verify allowlist, set session. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const origin = new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=denied`, origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=missing_code`, origin));
  }

  const store = await cookies();
  const verifier = store.get(VERIFIER_COOKIE_NAME)?.value;
  if (!verifier) {
    return NextResponse.redirect(new URL(`/login?error=stale`, origin));
  }

  const redirectUri = `${origin}/api/auth/callback`;
  const result = await exchangeCodeForEmail(code, verifier, redirectUri);

  if ("error" in result) {
    return NextResponse.redirect(new URL(`/login?error=exchange&detail=${encodeURIComponent(result.error)}`, origin));
  }

  if (!isAllowedEmail(result.email)) {
    return NextResponse.redirect(new URL(`/login?error=not_allowed&email=${encodeURIComponent(result.email)}`, origin));
  }

  const session = await createSessionCookie(result.email);
  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set("pm_session", session, sessionCookieOptions());
  response.cookies.delete(VERIFIER_COOKIE_NAME);
  return response;
}
