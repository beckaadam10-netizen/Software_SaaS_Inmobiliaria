import type { NextConfig } from "next";

// El navegador siempre habla con Next.js; las rutas /api se reenvían al backend.
// Así la cookie de sesión es del mismo origen y no hace falta configurar CORS.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
