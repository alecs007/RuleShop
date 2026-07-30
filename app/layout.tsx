import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RouteLoading } from "@/components/ui/route-loading";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "RuleShop",
    template: "%s | RuleShop",
  },
  description:
    "Magazin online guvernat în timp real de un rule engine configurabil.",
  icons: {
    icon: [
      { url: "/icon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon/favicon.ico",
    apple: [
      {
        url: "/icon/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: "RuleShop",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body className={`${inter.className} min-h-screen antialiased`}>
        {children}
        {/* Ecranul de încărcare trăiește în layout-ul rădăcină: nu se remontează
            la navigare, deci poate acoperi chiar tranziția dintre pagini. */}
        <Suspense>
          <RouteLoading />
        </Suspense>
      </body>
    </html>
  );
}
