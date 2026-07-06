import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "https://api.euroscale.app/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
