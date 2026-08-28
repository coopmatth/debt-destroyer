import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Plaid Node SDK is server-only. Keeping it external stops the bundler
  // from ever tracing it into a client chunk alongside our secrets.
  serverExternalPackages: ["plaid"],
};

export default nextConfig;
