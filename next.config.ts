import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the round "N" developer badge (bottom-left) while running
  // `npm run dev`. Build/runtime errors still show. Never shown on Vercel.
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3", "@napi-rs/canvas"],
  // the receipt is drawn on the server from these files, so they ship with the routes that draw it
  outputFileTracingIncludes: {
    "/api/submissions": ["./public/branding/receipt-*.png", "./public/fonts/FrescoStamp.ttf"],
    "/api/receipts/[id]": ["./public/branding/receipt-*.png", "./public/fonts/FrescoStamp.ttf"],
  },
  // the archive dive used to live at /mobile; old links (with their ?thought=) still land on it
  async redirects() {
    return [{ source: "/mobile", destination: "/gallery", permanent: true }];
  },
  // dive-deep-7 Electron (file://) polls / SSE these routes
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
