import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Reaching the dev server over Tailscale from the phone.
  allowedDevOrigins: ["100.110.117.87", "localhost:3000"],
  // The Plaid Node SDK is server-only. Keeping it external stops the bundler
  // from ever tracing it into a client chunk alongside our secrets.
  serverExternalPackages: ["plaid"],
};

export default nextConfig;
