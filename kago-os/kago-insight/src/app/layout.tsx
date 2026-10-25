import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAGO/Insight — 店舗向け管理画面",
  description: "店舗のおすすめ・値引き設定と、販促効果の確認を行う店舗担当者向け画面。",
  applicationName: "KAGO/Insight",
};

export const viewport: Viewport = { themeColor: "#f5f8fa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        <SiteHeader />
        <div className="mx-auto max-w-7xl">
          <main className="insight-main px-4 py-7 sm:px-6 sm:py-9">{children}</main>
        </div>
      </body>
    </html>
  );
}
