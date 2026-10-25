import type { NextConfig } from "next";

const insightOrigin = process.env.INSIGHT_ORIGIN;
if (insightOrigin) {
  const url = new URL(insightOrigin);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("INSIGHT_ORIGIN must be an HTTP(S) origin without credentials or a path");
}

const adsOrigin = process.env.ADS_ORIGIN;
if (adsOrigin) {
  const url = new URL(adsOrigin);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("ADS_ORIGIN must be an HTTP(S) origin without credentials or a path");
}

const nextConfig: NextConfig = {
  devIndicators: false,
  // Keep browser checks/builds separate from a developer's running server.
  distDir: process.env.KAGO_NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@kago/backend"],
  async rewrites() {
    // Serve the original static LP without applying the App's styles or scripts.
    return {
      beforeFiles: [
        ...(insightOrigin ? [{ source: "/insight/:path*", destination: `${new URL(insightOrigin).origin}/insight/:path*` }] : []),
        ...(adsOrigin ? [
          // On Vercel an empty :path* becomes "/ads/", which Ads redirects back to "/ads" forever.
          { source: "/ads", destination: `${new URL(adsOrigin).origin}/ads` },
          { source: "/ads/:path*", destination: `${new URL(adsOrigin).origin}/ads/:path*` },
          { source: "/ads-static/:path*", destination: `${new URL(adsOrigin).origin}/ads-static/:path*` },
          { source: "/ad-assets/:path*", destination: `${new URL(adsOrigin).origin}/ad-assets/:path*` },
        ] : []),
      ],
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
