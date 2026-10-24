import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/parts";
import { StoreDetail } from "@/features/portal/store-detail";

export const metadata: Metadata = { title: "店舗の詳細" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <StoreDetail />
    </Suspense>
  );
}
