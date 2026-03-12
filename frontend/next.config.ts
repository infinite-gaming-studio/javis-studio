import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Studio API routes
      {
        source: "/api/studio/:path*",
        destination: "http://localhost:8000/api/studio/:path*",
      },
      // Tools API routes (video-matcher, etc.)
      {
        source: "/api/v1/tools/:path*",
        destination: "http://localhost:8000/api/v1/tools/:path*",
      },
    ];
  },
};

export default nextConfig;
