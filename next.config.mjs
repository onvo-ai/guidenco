/** @type {import('next').NextConfig} */

const nextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "remotion",
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/compositor-darwin-arm64",
    "esbuild",
    "@esbuild/darwin-arm64",
  ],
};

export default nextConfig;
