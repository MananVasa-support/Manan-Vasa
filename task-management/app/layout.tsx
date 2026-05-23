import type { Metadata } from "next";
import { Roboto, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { ToastHost } from "@/components/ui/toast";
import { RegisterSW } from "@/components/pwa/register-sw";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  display: "swap",
});

// Display font for the KPI hero numerals and section headlines. Variable
// weight + optical sizing means it holds up at 160px without looking
// stretched. Picked over Inter / system-ui so the dashboard has a
// recognisable typographic voice instead of generic-sans aesthetics.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

// Monospace voice for eyebrow labels + small caps in the holographic
// strip. Pairs against Bricolage's geometric curves for tension.
// Uses --font-mono-display (not --font-mono) so the existing @theme
// fallback chain stays intact for any code path that wants generic
// monospace.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-display",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Altus Corp — Work Management Dashboard",
  description: "Altus Corp work management dashboard",
  metadataBase: new URL("https://altus-corp-dashboard.vercel.app"),
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${bricolage.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {/* NuqsAdapter wires nuqs's useQueryState into the Next App Router
            so URL-as-state hooks (settings tabs, filter bars, etc.) work.
            Required by nuqs v2+ — without it any client component calling
            useQueryState throws "nuqs requires an adapter". */}
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
        <ToastHost />
        <RegisterSW />
      </body>
    </html>
  );
}
