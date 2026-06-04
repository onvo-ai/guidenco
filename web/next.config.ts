import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent bundling of native/Node-only packages
  serverExternalPackages: ["pg", "minio", "ws", "better-auth", "@better-auth/kysely-adapter", "kysely", "openai"],
  // Pretty install URL: `curl -fsSL <host>/install.sh | sudo bash` resolves to
  // the bridged installer script.
  async rewrites() {
    return [{ source: "/install.sh", destination: "/api/install/bridged" }];
  },
};

export default nextConfig;
