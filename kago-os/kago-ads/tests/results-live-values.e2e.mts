// Real Supabase read-only values check: no fixtures, intercepted data or business writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium } from "playwright";
import { createHeadlessBackend, readBackendConfig, signInBackend, signOutBackend } from "@kago/backend";
import { createSupabaseResultsRepository } from "../src/lib/backend/results.ts";
import { requireMaker } from "../src/lib/backend/portal.ts";
import { summarizeApp, summarizeSignage, rate, type MetricValue } from "../src/lib/results/results.ts";
import { addDays, dayStart, dayEnd, today } from "../src/lib/domain/rules.ts";
const port = await new Promise<number>((resolve, reject) => { const socket = createServer(); socket.on("error", reject); socket.listen(0, "127.0.0.1", () => { const address = socket.address(); assert.ok(address && typeof address !== "string"); socket.close(error => error ? reject(error) : resolve(address.port)); }); });
const base = "http://127.0.0.1:" + port;
const accounts = [{ email: process.env.KAGO_ADS_CHECK_EMAIL, password: process.env.KAGO_ADS_CHECK_PASSWORD }, { email: process.env.KAGO_ADS_CHECK_B_EMAIL, password: process.env.KAGO_ADS_CHECK_B_PASSWORD }];
assert.ok(accounts.every(a => a.email && a.password), "Two maker accounts are required");
const config = readBackendConfig({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
let startup = "";
server.stdout.on("data", chunk => { startup = (startup + String(chunk)).slice(-512); });
const clients: ReturnType<typeof createHeadlessBackend>[] = [], attemptedWrites: string[] = [];
const seenMakers = new Set<string>(), placementCounts: number[] = [];
let browser, stage = "startup", checks = 0, cells = 0, positive = 0, hidden = 0, unmeasured = 0;
function cell(v: MetricValue, unit = "", denominator?: MetricValue) {
    if (v === null) {
        hidden++;
        return "非公開";
    }
    if (v === "unmeasured") {
        unmeasured++;
        return "未計測";
    }
    const r = denominator === undefined ? null : rate(v, denominator);
    return Math.round(v).toLocaleString("ja-JP") + unit + (r === null ? "" : "（" + r + "%）");
}
const normalize = (s: string) => s.replace(/\s+/g, "");
try {
    for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null)
            throw Error("server failed");
        try {
            if (startup.includes("Ready in") && (await fetch(base + "/ads/portal")).ok)
                break;
        }
        catch { }
        if (i === 99)
            throw Error("server not ready");
        await new Promise(r => setTimeout(r, 200));
    }
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
    for (const [index, a] of accounts.entries()) {
        stage = index + ":read";
        const c = createHeadlessBackend(config);
        clients.push(c);
        await signInBackend(c, a.email!, a.password!, "maker_staff");
        const identity = await requireMaker(c), session = { role: "maker_staff" as const, makerId: identity.makerIds[0] };
        const query = { start: dayStart(addDays(today(), -30)), end: dayEnd(today()) };
        assert.ok(identity.makerIds.every(id => !seenMakers.has(id)), "Accounts must belong to different makers");
        identity.makerIds.forEach(id => seenMakers.add(id));
        const repo = createSupabaseResultsRepository(c), data = await repo.listMakerResults(session, query);
        placementCounts.push(data.placements.length);
        positive += data.signage.filter(r => Number(r.plays) > 0).length + data.app.filter(r => Number(r.impressions) > 0).length;
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), p = await ctx.newPage();
        p.setDefaultTimeout(15000);
        const errors: string[] = [];
        p.on("pageerror", e => errors.push(e.message));
        await ctx.route("**/*", r => {
            const request = r.request(), url = new URL(request.url());
            if (url.pathname.startsWith("/ads-static/_next/"))
                return r.continue({ url: base + url.pathname.slice("/ads-static".length) + url.search });
            if (url.pathname.startsWith("/rest/v1/") && !["GET", "HEAD", "OPTIONS"].includes(request.method()) && !(request.method() === "POST" && ["/rest/v1/rpc/kago_app_metrics", "/rest/v1/rpc/kago_signage_metrics"].includes(url.pathname))) {
                attemptedWrites.push(url.pathname);
                return r.abort();
            }
            return r.continue();
        });
        stage = index + ":login";
        await p.goto(base + "/ads/portal");
        stage = index + ":email";
        await p.getByLabel("メールアドレス").fill(a.email!);
        await p.getByLabel("パスワード", { exact: true }).fill(a.password!);
        stage = index + ":submit";
        await p.getByRole("button", { name: "ログイン", exact: true }).click();
        await p.getByRole("heading", { name: "募集ポータル", exact: true }).waitFor();
        checks++;
        await p.getByRole("link", { name: "広告の成果", exact: true }).click();
        await p.getByRole("heading", { name: "広告の成果", exact: true }).waitFor();
        if (data.placements.length) {
            await p.getByTestId("result-" + data.placements[0].id).waitFor();
            assert.equal(await p.locator('[data-testid^="result-"]').count(), data.placements.length);
            for (const placement of data.placements) {
                stage = index + ":values";
                const card = p.getByTestId("result-" + placement.id).locator("..");
                for (const row of summarizeApp(placement, data.app)) {
                    if (!placement.channels.includes("app"))
                        continue;
                    const actual = await card.getByTestId("app-" + row.origin).locator("td").allTextContents();
                    const expected = [cell(row.impressions), cell(row.shownVisits), cell(row.clicks, "", row.impressions), cell(row.recommendationAdds, "", row.impressions), cell(row.recommendationRemoves), cell(row.purchases, "", row.impressions), cell(row.purchasedQuantity), cell(row.purchaseAmount, "円")];
                    assert.deepEqual(actual.slice(1).map(normalize), expected.map(normalize));
                    cells += expected.length;
                    if (row.smallSample)
                        await card.getByText("少数のため参考値", { exact: true }).waitFor();
                }
                for (const row of summarizeSignage(placement, data.signage)) {
                    if (!placement.channels.includes("signage"))
                        continue;
                    const actual = await card.getByTestId("signage-" + row.origin).locator("td").allTextContents();
                    const coverage = row.measuredPlays === null ? "非公開" : rate(row.measuredPlays, row.plays) === null ? "－" : rate(row.measuredPlays, row.plays) + "%";
                    const expected = [cell(row.plays), cell(row.playSeconds, "秒"), coverage, cell(row.estimatedViewers, "人"), cell(row.estimatedViewSeconds, "秒"), cell(row.referenceSales)];
                    assert.deepEqual(actual.slice(1).map(normalize), expected.map(normalize));
                    cells += expected.length;
                }
            }
        }
        else
            await p.getByText("承認された広告はまだありません。店舗の募集に申請し、承認されると、ここに成果が出ます。", { exact: true }).waitFor();
        assert.equal(await p.locator('[data-testid^="result-"]').count(), data.placements.length);
        checks++;
        stage = index + ":mobile";
        await p.setViewportSize({ width: 390, height: 844 });
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        checks++;
        stage = index + ":logout";
        await p.getByRole("button", { name: "ログアウト", exact: true }).click();
        await p.goto(base + "/ads/maker/results");
        await p.getByRole("heading", { name: "メーカーとしてログイン", exact: true }).waitFor();
        assert.equal(await p.locator('[data-testid^="result-"]').count(), 0);
        checks++;
        await signOutBackend(c);
        await assert.rejects(() => repo.listMakerResults(session, query));
        checks++;
        assert.deepEqual(errors, []);
        await ctx.close();
    }
    assert.ok(positive > 0, "No positive live metrics; this must not pass using only empty results");
    assert.ok(cells > 0);
    assert.deepEqual(attemptedWrites, []);
    console.log(JSON.stringify({ result: "PASS", accounts: accounts.length, placements: placementCounts, browserChecks: checks, matchedMetricCells: cells, positiveMetricRows: positive, hiddenCells: hidden, unmeasuredCells: unmeasured, businessWrites: 0 }));
}
catch {
    console.error(JSON.stringify({ result: "FAIL", stage }));
    process.exitCode = 1;
}
finally {
    await browser?.close();
    server.kill();
    await Promise.all(clients.map(c => signOutBackend(c).catch(() => undefined)));
}
