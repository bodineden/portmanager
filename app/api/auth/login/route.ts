import { NextResponse } from "next/server";
import {
  authConfigured,
  createVerifierCookie,
  googleAuthUrl,
  pkceChallenge,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/auth/login — start the Google OAuth flow (PKCE). */
export async function GET(request: Request) {
  if (!authConfigured()) {
    return NextResponse.redirect(new URL("/login?error=not_configured", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback`;

  const { name, value, options } = await createVerifierCookie();
  const challenge = await pkceChallenge(value);

  const url = googleAuthUrl(clientId, redirectUri, challenge);
  const response = NextResponse.redirect(url);
  response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  return response;
}
