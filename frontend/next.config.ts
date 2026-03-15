import type { NextConfig } from "next";

// 根据环境变量确定后端地址（Docker 内使用服务名，外部使用 localhost）
const backendUrl = process.env.BACKEND_API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // ═══════════════════════════════════════════════════════════════════════════
      // Studio API routes
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Audio files served by backend
      {
        source: "/api/studio/audio/:session_id/:filename",
        destination: `${backendUrl}/api/studio/audio/:session_id/:filename`,
      },
      
      // Script generation - handled by backend
      {
        source: "/api/studio/script",
        destination: `${backendUrl}/api/studio/script`,
      },
      
      // Full pipeline generation - handled by backend
      {
        source: "/api/studio/generate",
        destination: `${backendUrl}/api/studio/generate`,
      },
      
      // TTS is handled by frontend API route to support external TTS APIs
      // This allows the frontend to proxy to user-configured TTS endpoints (e.g., ngrok)
      // {
      //   source: "/api/studio/tts",
      //   destination: `${backendUrl}/api/studio/tts`,
      // },
      
      // ═══════════════════════════════════════════════════════════════════════════
      // Tools API routes - proxied by frontend to handle auth headers
      // ═══════════════════════════════════════════════════════════════════════════
      
      // YouTube video download - handled by backend directly
      {
        source: "/api/v1/tools/video-matcher/download/youtube/:video_id",
        destination: `${backendUrl}/api/v1/tools/video-matcher/download/youtube/:video_id`,
      },

      // Tasks API - handled by backend directly
      {
        source: "/api/v1/tools/tasks/:task_id",
        destination: `${backendUrl}/api/v1/tools/tasks/:task_id`,
      },
      {
        source: "/api/v1/tools/tasks/:task_id/download",
        destination: `${backendUrl}/api/v1/tools/tasks/:task_id/download`,
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
