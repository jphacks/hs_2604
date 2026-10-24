import type { Metadata } from "next";
import { ApplicationList } from "@/features/applications/application-list";

export const metadata: Metadata = { title: "申請一覧" };

export default function Page() {
  return <ApplicationList />;
}
