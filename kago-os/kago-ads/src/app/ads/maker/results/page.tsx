import type { Metadata } from "next";
import { MakerResults } from "@/features/results/maker-results";

export const metadata: Metadata = { title: "広告の成果" };

export default function Page() {
  return <MakerResults />;
}
