import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Access gate (Next 16 proxy = renamed middleware).
 *
 * - Allows /login, /api/auth/* and static assets through.
 * - Everything else requires a valid `pm_session` cookie (HMAC-SHA256 over
 *   base64url(payload), signed with AUTH_SECRET, exp-checked).
 * - Gate arms ONLY when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set;
 *   until then the site stays open (never bricks access mid-deploy).
 *
 * Self-contained on purpose: proxy runs on the edge runtime, so it must not
 * import next/headers or the app's lib modules.
 */

const SESSION_COOKIE = "pm_session";

function b64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sessionValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(body)
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!payload.exp || Date.now() > payload.exp * 1000) return false;
    return typeof payload.email === "string";
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon");
  if (isStatic) return NextResponse.next();

  const isAuthRoute = pathname.startsWith("/api/auth") || pathname === "/login";
  if (isAuthRoute) return NextResponse.next();

  // Gate arms only when Google OAuth is configured.
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!(await sessionValid(session))) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API auth handlers, static files, and assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
