import type { NextConfig } from "next";

// analytic-be; the browser calls /api/* and Next forwards it there
const API_URL = process.env.ANALYTIC_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  /* config options here */
  // let `next dev` serve its client JS through cloudflared quick tunnels
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
