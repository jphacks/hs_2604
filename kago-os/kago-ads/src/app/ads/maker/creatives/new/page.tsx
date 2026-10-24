import type { Metadata } from "next";
import { NewAd } from "@/features/creatives/new-creative";

export const metadata: Metadata = { title: "広告の登録" };

export default function Page() {
  return <NewAd />;
}
