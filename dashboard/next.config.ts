import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "/api/rest/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
