import type { Metadata } from "next";
import { SignageDev } from "@/features/signage/signage-dev";

export const metadata: Metadata = { title: "Signage の確認" };

export default function Page() {
  return <SignageDev />;
}
