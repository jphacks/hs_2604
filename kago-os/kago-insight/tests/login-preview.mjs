// ログイン復帰の確認専用。実Supabase・実アカウントを使わない。
// Auth/Store所属は既存の使い捨てDB、審査一覧は空の固定応答である。
import { createServer } from "node:http";
import { createSignageDatabase } from "../../kago-ads/tests/fixtures/signage-database.mts";

const fixture = await createSignageDatabase();
const api = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers))
      if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    const init = { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks).toString() : undefined };
    let response;
    // 認証を通した後、今回の認証復帰試験に不要な業務データは空にする。
    if (req.method === "GET" && ["/rest/v1/ad_applications", "/rest/v1/application_revisions", "/rest/v1/ad_placements"].includes(req.url.split("?")[0])) {
      const who = await fixture.fetcher("https://fixture.supabase.co/auth/v1/user", { headers });
      response = who.ok ? Response.json([]) : who;
    } else {
      response = await fixture.fetcher("https://fixture.supabase.co" + req.url, init);
    }
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.statusCode = 500;
    res.end("local fixture failed");
  }
});
api.listen(3253, "127.0.0.1", () => console.log("Local login fixture ready on 3253"));
const stop = async () => {
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
  await fixture.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
