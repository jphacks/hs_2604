import type { Metadata } from "next";
import { AdList } from "@/features/creatives/creative-list";

export const metadata: Metadata = { title: "自社の広告" };

export default function Page() {
  return <AdList />;
}
