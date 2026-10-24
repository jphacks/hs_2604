import type { Metadata } from "next";
import { RecruitmentForm } from "@/features/ad-calls/call-form";

export const metadata: Metadata = { title: "新しい募集" };

export default function Page() {
  return <RecruitmentForm />;
}
