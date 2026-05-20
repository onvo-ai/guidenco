import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Turbopack from trying to bundle native/Node-only packages
  serverExternalPackages: ["pg", "minio", "ws", "better-auth"],
};

export default nextConfig;
