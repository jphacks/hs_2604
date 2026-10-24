import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/parts";
import { ApplicationDetail } from "@/features/applications/application-detail";

export const metadata: Metadata = { title: "申請の詳細" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ApplicationDetail />
    </Suspense>
  );
}
