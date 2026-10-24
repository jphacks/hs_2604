import { DemoAdsHeader as AdsHeader } from "@/features/shell/ads-header";

export default function SignageDevLayout({ children }: LayoutProps<"/signage/dev">) {
  return (
    <>
      <AdsHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
