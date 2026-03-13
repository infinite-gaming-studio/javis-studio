import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // ═══════════════════════════════════════════════════════════════════════════
      // Studio API routes
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Audio files served by backend
      {
        source: "/api/studio/audio/:session_id/:filename",
        destination: "http://localhost:8000/api/studio/audio/:session_id/:filename",
      },
      
      // Script generation - handled by backend
      {
        source: "/api/studio/script",
        destination: "http://localhost:8000/api/studio/script",
      },
      
      // Full pipeline generation - handled by backend
      {
        source: "/api/studio/generate",
        destination: "http://localhost:8000/api/studio/generate",
      },
      
      // TTS is handled by frontend API route to support external TTS APIs
      // This allows the frontend to proxy to user-configured TTS endpoints (e.g., ngrok)
      // {
      //   source: "/api/studio/tts",
      //   destination: "http://localhost:8000/api/studio/tts",
      // },
      
      // ═══════════════════════════════════════════════════════════════════════════
      // Tools API routes - proxied by frontend to handle auth headers
      // ═══════════════════════════════════════════════════════════════════════════
      
      // YouTube video download - handled by backend directly
      {
        source: "/api/v1/tools/video-matcher/download/youtube/:video_id",
        destination: "http://localhost:8000/api/v1/tools/video-matcher/download/youtube/:video_id",
      },
      
      // Other video-matcher routes are handled by frontend API routes:
      // - /api/v1/tools/video-matcher -> frontend/src/app/api/v1/tools/video-matcher/route.ts
      // - /api/v1/tools/video-matcher/search -> frontend/src/app/api/v1/tools/video-matcher/search/route.ts
      // - /api/v1/tools/video-matcher/download/batch -> frontend/src/app/api/v1/tools/video-matcher/download/batch/route.ts
      // These frontend routes add proper header forwarding for API keys
    ];
  },
};

export default nextConfig;
