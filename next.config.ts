import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@napi-rs/canvas"],
  // the dive used to live at /mobile; old links and QR codes (with their ?thought=) still land on it
  async redirects() {
    return [{ source: "/mobile", destination: "/", permanent: true }];
  },
};

export default nextConfig;
