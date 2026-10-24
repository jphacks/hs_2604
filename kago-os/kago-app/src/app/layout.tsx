import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "KAGO/OS — あなたが選ぶ。売り場が応える。",
  description:
    "買い物支援・店頭表示・効果分析をつなぐ実店舗向けプラットフォーム。",
  applicationName: "KAGO/OS",
  icons: {
    icon: [
      { url: "/icons/os/favicon-light.png", sizes: "64x64", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icons/os/favicon-dark.png", sizes: "64x64", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/icons/os/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#f1f2ed" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
