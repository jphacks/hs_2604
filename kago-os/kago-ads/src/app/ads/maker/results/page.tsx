import type { Metadata } from "next";
import { MakerResults } from "@/features/results/maker-results";

export const metadata: Metadata = { title: "広告の成果" };

export default function Page() {
  return <><p className="mb-4 text-sm"><a className="underline" href="/ads/fixed-results/index.html">通信断に備えて説明用の固定成果を開く</a></p><MakerResults /></>;
}
