import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 共通の認証・DB接続（kago-os/shared/backend）は TypeScript のまま公開されているので変換する
  transpilePackages: ["@kago/backend"],
};

export default nextConfig;
