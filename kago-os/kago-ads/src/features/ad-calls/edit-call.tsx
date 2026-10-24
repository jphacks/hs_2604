"use client";
import { useSearchParams } from "next/navigation";
import { RecruitmentForm } from "@/features/ad-calls/call-form";

export function EditRecruitment() {
  const id = useSearchParams().get("id") ?? "";
  return <RecruitmentForm key={id} id={id} />;
}
