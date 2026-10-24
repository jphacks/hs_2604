import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
