import type { Metadata } from "next";
import { SignageHome } from "@/features/signage/signage-home";

export const metadata: Metadata = { title: "KAGO/Signage" };

export default function Page() {
  return <SignageHome />;
}
