import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/auth/logout — clear the session cookie and return to /login. */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/login", origin), 303);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
