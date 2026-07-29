import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RuleShop",
    template: "%s | RuleShop",
  },
  description: "Magazin online întreținut de un rule engine configurabil.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
