import type { Metadata } from "next";
import { StoreList } from "@/features/portal/store-list";

export const metadata: Metadata = { title: "店舗一覧" };

export default function Page() {
  return <StoreList />;
}
