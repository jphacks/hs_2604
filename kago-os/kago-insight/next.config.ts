import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_INSIGHT_BASE_PATH === "/insight" ? "/insight" : "",
  // 共有パッケージ @kago/backend は TypeScript ソースを公開する内部パッケージなので、
  // Next.js 側で変換する（docs/development/backend.md「各サービスからの利用」）。
  transpilePackages: ["@kago/backend"],
};

export default nextConfig;
