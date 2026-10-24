import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/nav";
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
        <header className="bg-[var(--accent)] px-4 py-3 text-white">
          <div className="mx-auto flex max-w-6xl items-baseline gap-3">
            <span className="text-lg font-bold">KAGO/Insight</span>
            <span className="text-sm opacity-80">広島デモ店</span>
          </div>
        </header>
        <div className="mx-auto max-w-6xl">
          <Nav />
          <main className="p-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
