import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RouteLoading } from "@/components/ui/route-loading";
import { Toaster } from "@/components/ui/toaster";
import { FlashToast } from "@/components/ui/flash-toast";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
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
      <head>
        {/* Fading images light up on `onLoad`, which never fires without JS */}
        <noscript>
          <style>{`.fade-img { opacity: 1 !important }`}</style>
        </noscript>
      </head>
      <body className={`${inter.className} min-h-screen antialiased`}>
        {children}

        <Suspense>
          <RouteLoading />
        </Suspense>

        <Toaster />
        <Suspense>
          <FlashToast />
        </Suspense>
        <Suspense>
          <ScrollToTop />
        </Suspense>
      </body>
    </html>
  );
}
