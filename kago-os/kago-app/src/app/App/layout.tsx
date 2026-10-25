import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/features/shopping/app-providers";
import "../globals.css";

export const metadata: Metadata = {
  title: "KAGO/App | スキャンからはじまる買い物体験",
  description:
    "商品スキャン、商品メニュー、おすすめ、買い物かごを一つにつなぐKAGO/OSのショッピングアプリ。",
  applicationName: "KAGO App",
  manifest: "/App/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KAGO",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/app/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/app/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/app/favicon-light.png", sizes: "64x64", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icons/app/favicon-dark.png", sizes: "64x64", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: [
      {
        url: "/icons/app/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
};

export default function AppLayout({ children }: LayoutProps<"/App">) {
  return (
    <AppProviders>{children}</AppProviders>
  );
}
