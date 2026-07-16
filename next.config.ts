import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prisma must stay external — Turbopack cannot resolve the generated client otherwise
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
