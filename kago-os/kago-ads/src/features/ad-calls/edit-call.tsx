"use client";
import { useSearchParams } from "next/navigation";
import { ErrorList } from "@/components/parts";
import { RecruitmentForm } from "@/features/ad-calls/call-form";

export function EditRecruitment() {
  const id = useSearchParams().get("id") ?? "";
  if (!id) return <ErrorList errors={["募集が指定されていません"]} />;
  return <RecruitmentForm key={id} id={id} />;
}
