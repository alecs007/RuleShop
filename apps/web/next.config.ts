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

  // The build's file tracing root is the workspace, not this directory, or
  // the `packages/` output is missing.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // The workspace packages ship as TypeScript, so a change in the engine shows
  // up immediately with no build step between.
  transpilePackages: [
    "@ruleshop/rule-engine",
    "@ruleshop/rate-limit",
    "@ruleshop/storefront",
  ],

  experimental: {
    // `lucide-react` exports thousands of icons from one index; without this,
    // importing three pulls the whole barrel into the module graph.
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
