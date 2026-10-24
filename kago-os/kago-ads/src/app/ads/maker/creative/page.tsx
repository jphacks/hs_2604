import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/parts";
import { AdDetail } from "@/features/creatives/creative-detail";

export const metadata: Metadata = { title: "広告の詳細" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AdDetail />
    </Suspense>
  );
}
