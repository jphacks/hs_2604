import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAGO/Insight — 店舗向け管理画面",
  description: "広告の審査、店舗販促の設定、成果の確認を行う店舗担当者向け画面。",
  applicationName: "KAGO/Insight",
};

export const viewport: Viewport = { themeColor: "#f1f2ed" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        <SiteHeader />
        <div className="mx-auto max-w-6xl">
          <main className="p-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
