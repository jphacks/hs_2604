import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Keep browser checks/builds separate from a developer's running server.
  distDir: process.env.KAGO_NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@kago/backend"],
  async rewrites() {
    // Serve the original static LP without applying the App's styles or scripts.
    return [{ source: "/", destination: "/website/index.html" }];
  },
  async redirects() {
    return [
      { source: "/concept", destination: "/", permanent: true },
      ...["account", "store", "demo-barcodes"].map((page) => ({
        source: `/${page}`,
        destination: `/App/${page}`,
        permanent: true,
      })),
      {
        source: "/manifest.webmanifest",
        destination: "/App/manifest.webmanifest",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
