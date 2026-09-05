import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "plottable/plottable.css";
import "./globals.css";
import { BlueprintThemeProvider } from "./components/blueprint-theme-provider";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "PortManager — Portfolio Tracker",
    template: "%s | PortManager",
  },
  description: "A private, read-only portfolio dashboard. Live values and recorded profit and loss in USD, with THB alongside.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={outfit.variable}
    >
      <body>
        <BlueprintThemeProvider>
          <div className="app-root">{children}</div>
        </BlueprintThemeProvider>
      </body>
    </html>
  );
}
