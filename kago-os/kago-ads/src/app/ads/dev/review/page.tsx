import type { Metadata } from "next";
import { DevReview } from "@/features/dev-review/dev-review";

export const metadata: Metadata = { title: "審査（確認用）" };

export default function Page() {
  return <DevReview />;
}
