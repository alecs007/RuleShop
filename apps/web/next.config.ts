import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Monorepo: rădăcina pentru urmărirea fișierelor la build este workspace-ul,
  // nu doar acest director — altfel pachetele din `packages/` lipsesc din output.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Pachetele din workspace sunt publicate ca TypeScript, nu precompilate:
  // Next le transpilează, deci o modificare în motor se vede imediat, fără un
  // pas de build între ele.
  transpilePackages: ["@ruleshop/rule-engine", "@ruleshop/rate-limit"],

  experimental: {
    // `lucide-react` exportă mii de iconițe dintr-un singur index. Fără asta,
    // un import de trei iconițe trage tot barrel-ul în graful de module —
    // se simte mai ales la compilarea din `dev`.
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "platform-lookaside.fbsbx.com" },
    ],
  },
};

export default nextConfig;
