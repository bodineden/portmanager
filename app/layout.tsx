import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "plottable/plottable.css";
import "./globals.css";
import { BlueprintThemeProvider } from "./components/blueprint-theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PortManager — Portfolio Tracker",
    template: "%s | PortManager",
  },
  description: "Track holdings, daily asset prices, exchange rates, and portfolio performance in Thai baht.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} bp6-dark`}
    >
      <body className="bp6-dark">
        <BlueprintThemeProvider>
          <div className="app-root">{children}</div>
        </BlueprintThemeProvider>
      </body>
    </html>
  );
}
