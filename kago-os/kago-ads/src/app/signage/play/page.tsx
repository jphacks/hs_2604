import type { Metadata } from "next";
import { Suspense } from "react";
import { SignagePlayer } from "@/features/signage/player";

export const metadata: Metadata = { title: "Signage 端末" };

export default function Page() {
  return (
    <Suspense>
      <SignagePlayer />
    </Suspense>
  );
}
