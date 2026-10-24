import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/App",
    name: "KAGO App",
    short_name: "KAGO",
    description: "あなたが選ぶ。売り場が応える。買い物支援アプリ",
    start_url: "/App",
    scope: "/App",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f7f5",
    theme_color: "#047857",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/icons/app/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
