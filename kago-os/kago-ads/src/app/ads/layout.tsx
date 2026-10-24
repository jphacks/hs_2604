import { AdsHeader } from "@/features/shell/ads-header";
import { AdsAccess, AdsFooter, AdsRuntime } from "@/features/auth/ads-runtime";

export default function AdsLayout({ children }: LayoutProps<"/ads">) {
  return <AdsRuntime>
    <AdsHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"><AdsAccess>{children}</AdsAccess></main>
    <AdsFooter />
  </AdsRuntime>;
}
