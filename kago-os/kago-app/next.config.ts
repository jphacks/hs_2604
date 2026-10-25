import type { NextConfig } from "next";

const insightOrigin = process.env.INSIGHT_ORIGIN;
if (insightOrigin) {
  const url = new URL(insightOrigin);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("INSIGHT_ORIGIN must be an HTTP(S) origin without credentials or a path");
}

const nextConfig: NextConfig = {
  // Keep browser checks/builds separate from a developer's running server.
  distDir: process.env.KAGO_NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@kago/backend"],
  async rewrites() {
    // Serve the original static LP without applying the App's styles or scripts.
    return {
      beforeFiles: insightOrigin ? [{ source: "/insight/:path*", destination: `${new URL(insightOrigin).origin}/insight/:path*` }] : [],
      afterFiles: [{ source: "/", destination: "/website/index.html" }],
    };
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
