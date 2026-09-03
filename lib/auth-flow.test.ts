import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as logoutRoute from "../app/api/auth/logout/route";

const projectRoot = new URL("../", import.meta.url);

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

describe("logout flow contract", () => {
  it("only exposes POST and clears the session in a 303 login redirect", async () => {
    expect("GET" in logoutRoute).toBe(false);

    const response = await logoutRoute.POST(new Request("https://portfolio.example/api/auth/logout", {
      method: "POST",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://portfolio.example/login");
    expect(response.headers.get("set-cookie")).toMatch(
      /pm_session=;\s*Path=\/;\s*Expires=Thu, 01 Jan 1970 00:00:00 GMT/i,
    );
  });

  it("submits logout with a native POST form rather than a prefetchable link", () => {
    const sidebar = source("app/components/app-sidebar.tsx");

    expect(sidebar).toMatch(/<form\s+action="\/api\/auth\/logout"\s+method="post"/);
    expect(sidebar).toMatch(/<button\s+type="submit"\s+className="sidebar-logout"/);
    expect(sidebar).not.toMatch(/<Link[^>]+href="\/api\/auth\/logout"/);
  });
});

describe("login flow contract", () => {
  it("redirects an existing session before rendering another sign-in prompt", () => {
    const loginPage = source("app/login/page.tsx");
    const sessionCheck = loginPage.indexOf("await requireSession()");
    const redirectCheck = loginPage.indexOf('if (email) redirect("/")');
    const paramsRead = loginPage.indexOf("await searchParams");

    expect(sessionCheck).toBeGreaterThan(-1);
    expect(redirectCheck).toBeGreaterThan(sessionCheck);
    expect(paramsRead).toBeGreaterThan(redirectCheck);
  });
});
