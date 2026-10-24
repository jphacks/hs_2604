import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KAGO/Ads", template: "%s｜KAGO/Ads" },
  description: "店舗の広告募集とメーカーの広告申請をつなぐポータル（KAGO/OS）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
