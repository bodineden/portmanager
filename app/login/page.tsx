import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import "./login.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(searchParams: Record<string, string | string[] | undefined>): { title: string; detail: string } | null {
  const code = typeof searchParams.error === "string" ? searchParams.error : "";
  switch (code) {
    case "not_configured":
      return {
        title: "Sign-in not configured yet",
        detail: "Google sign-in is not available yet. Please contact an administrator.",
      };
    case "denied":
      return { title: "Sign-in cancelled", detail: "You closed the Google sign-in window. Try again when ready." };
    case "missing_code":
      return { title: "Missing authorization code", detail: "Google did not return a code. Please try signing in again." };
    case "stale":
      return { title: "Session expired", detail: "The sign-in attempt took too long. Please start over." };
    case "exchange":
      return { title: "Google rejected the sign-in", detail: typeof searchParams.detail === "string" ? searchParams.detail : "Token exchange failed. Please try again." };
    case "not_allowed": {
      const email = typeof searchParams.email === "string" ? searchParams.email : "that account";
      return {
        title: "Access denied",
        detail: `${email} is not approved for this workspace. Please contact an administrator.`,
      };
    }
    default:
      return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const email = await requireSession();
  if (email) redirect("/");

  const params = await searchParams;
  const error = errorMessage(params);

  return (
    <main className="login-canvas">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">PM</span>
          <div className="login-brand-copy">
            <strong>Portfolio Manager</strong>
            <small>YOUR PRIVATE PORTFOLIO</small>
          </div>
        </div>

        <div className="login-title-block">
          <p className="eyebrow">AUTHENTICATION / GOOGLE</p>
          <h1 className="login-title">Sign in to continue</h1>
          <p className="login-subtitle">
            This workspace is private. Access is limited to approved Gmail accounts.
          </p>
        </div>

        <a className="google-signin-button" href="/api/auth/login">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1z" />
            <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.1C6.22 6.87 8.87 4.76 12 4.76z" />
          </svg>
          <span>Continue with Google</span>
        </a>

        {error ? (
          <div className="login-error" role="alert">
            <strong>{error.title}</strong>
            <span>{error.detail}</span>
          </div>
        ) : null}

        <div className="login-footnote">
          <span>ALLOWLISTED DOMAIN</span>
          <p>Only approved Gmail addresses can open this workspace.</p>
          <Link href="/" className="login-back-link">Back to workspace</Link>
        </div>
      </section>
    </main>
  );
}
