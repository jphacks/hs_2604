import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/parts";
import { RecruitmentDetail } from "@/features/portal/call-detail";

export const metadata: Metadata = { title: "募集の詳細" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <RecruitmentDetail />
    </Suspense>
  );
}
