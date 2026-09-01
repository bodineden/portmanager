import { cookies } from "next/headers";

/**
 * Minimal Gmail (Google OAuth) login gate for PortManager.
 *
 * Design (hand-rolled, zero new deps):
 *  - PKCE authorization-code flow against Google's OAuth endpoints.
 *  - Session = httpOnly cookie `pm_session` = base64url(payload) + "." + HMAC-SHA256
 *    signature (AUTH_SECRET). Payload: { email, exp }.
 *  - Allowlist: ALLOWED_EMAILS env (comma-separated), defaults to the two
 *    owners Bodin specified. Case-insensitive compare.
 *  - Gate arms only when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set; until
 *    then the proxy lets traffic through (never bricks access mid-deploy).
 */

const SESSION_COOKIE = "pm_session";
const VERIFIER_COOKIE = "pm_oauth_verifier";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const DEFAULT_ALLOWED_EMAILS = [
  "putthiphan1608@gmail.com",
  "physic.din@gmail.com",
];

export function allowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS;
  if (!raw || !raw.trim()) return DEFAULT_ALLOWED_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const needle = email.trim().toLowerCase();
  return allowedEmails().includes(needle);
}

export function authConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required to sign sessions");
  return s;
}

/** base64url helpers (no padding). */
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

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payload: Record<string, unknown>): Promise<string> {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(authSecret()),
    new TextEncoder().encode(body)
  );
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifyPayload(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const key = await hmacKey(authSecret());
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!payload.exp || Date.now() > (payload.exp as number) * 1000) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function createSessionCookie(email: string): Promise<string> {
  const payload = { email: email.toLowerCase(), exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  return signPayload(payload);
}

export async function getSessionEmail(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyPayload(token);
  if (!payload || typeof payload.email !== "string") return null;
  return payload.email;
}

/** Server-component guard: returns the session email or null (proxy handles redirects). */
export async function requireSession(): Promise<string | null> {
  return getSessionEmail();
}

export async function createVerifierCookie(): Promise<{ name: string; value: string; options: Record<string, unknown> }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = b64urlEncode(bytes);
  return {
    name: VERIFIER_COOKIE,
    value: verifier,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600, // 10 minutes to complete the flow
    },
  };
}

export function getVerifierFromStore(store: Awaited<ReturnType<typeof cookies>>): string | null {
  return store.get(VERIFIER_COOKIE)?.value ?? null;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const VERIFIER_COOKIE_NAME = VERIFIER_COOKIE;

/** PKCE S256 challenge from a verifier (RFC 7636). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64urlEncode(new Uint8Array(digest));
}

export function googleAuthUrl(clientId: string, redirectUri: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange the authorization code for an id_token, then extract + verify the email. */
export async function exchangeCodeForEmail(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<{ email: string } | { error: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { error: "Google OAuth is not configured." };

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
  } catch (e) {
    return { error: `Token endpoint unreachable: ${(e as Error).message}` };
  }

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    return { error: `Google token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}` };
  }

  const data = await tokenRes.json().catch(() => ({}));
  const idToken = data.id_token as string | undefined;
  if (!idToken) return { error: "No id_token in Google response." };

  // id_token is a JWT; decode the payload (obtained server-side over TLS).
  const parts = idToken.split(".");
  if (parts.length !== 3) return { error: "Malformed id_token." };
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return { error: "Could not decode id_token payload." };
  }

  const aud = claims.aud as string | undefined;
  if (aud && aud !== clientId) return { error: "id_token audience mismatch." };
  const exp = claims.exp as number | undefined;
  if (exp && Date.now() > exp * 1000) return { error: "id_token expired." };
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!email) return { error: "Google did not return an email." };

  return { email };
}

/** Session-cookie attributes shared by login/logout handlers. */
export function sessionCookieOptions(): Record<string, unknown> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
