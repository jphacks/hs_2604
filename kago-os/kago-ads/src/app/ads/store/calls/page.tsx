import type { Metadata } from "next";
import { RecruitmentList } from "@/features/ad-calls/call-list";

export const metadata: Metadata = { title: "自店の募集" };

export default function Page() {
  return <RecruitmentList />;
}
