import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent bundling of native/Node-only packages
  serverExternalPackages: ["pg", "minio", "ws", "better-auth", "openai"],
  // Tell Turbopack this is the project root (suppresses lockfile warning)
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
