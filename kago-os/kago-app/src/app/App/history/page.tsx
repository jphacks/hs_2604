"use client";

import { AccountShell } from "@/features/shopping/account-shell";
import { PersonalizationProvider } from "@/features/recommendations/personalization-provider";
import { PurchaseHistorySection } from "@/features/account/purchase-history";

export default function HistoryPage(){
 return <PersonalizationProvider><AccountShell active="history"><PurchaseHistorySection/></AccountShell></PersonalizationProvider>;
}
