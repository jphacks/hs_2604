import "./ads-workspace.css";
import { AdsHeader } from "@/features/shell/ads-header";
import { AdsAccess, AdsFooter, AdsRuntime } from "@/features/auth/ads-runtime";

export default function AdsLayout({ children }: LayoutProps<"/ads">) {
  return <AdsRuntime><div className="ads-workspace flex min-h-dvh flex-col">
    <AdsHeader />
    <main className="ads-main"><AdsAccess>{children}</AdsAccess></main>
    <AdsFooter />
  </div></AdsRuntime>;
}
