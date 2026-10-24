import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/parts";
import { EditRecruitment } from "@/features/ad-calls/edit-call";

export const metadata: Metadata = { title: "募集の編集" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <EditRecruitment />
    </Suspense>
  );
}
