import type { Metadata } from "next";
import { Portal } from "@/features/portal/portal";

export const metadata: Metadata = { title: "募集ポータル" };

export default function Page() {
  return <Portal />;
}
