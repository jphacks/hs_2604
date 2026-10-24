import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/parts";
import { NewApplication } from "@/features/applications/new-application";

export const metadata: Metadata = { title: "募集への申請" };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <NewApplication />
    </Suspense>
  );
}
