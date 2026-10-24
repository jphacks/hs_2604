import Link from "next/link";

const examples = [
  { title: "パスタ＋ソースのセット割", kind: "セット割", codes: [["スパゲッティ 500g", "2900000000100"], ["トマトパスタソース", "2900000000162"]],
    steps: ["パスタのコードを入力し「コードで追加」を押す。", "「いまだけのお得」に出るパスタ＋ソースのセットを選ぶ。", "「セットでかごに追加」を押す。両方の商品に10%の割引が付く。"],
    note: "両方がかごにある場合は「セット割を適用」。片方を削除するとセット割は外れます。" },
  { title: "牛乳＋食パンのセット割", kind: "セット割", codes: [["成分無調整牛乳 1L", "2900000000049"], ["もっちり食パン 6枚切", "2900000000056"]],
    steps: ["牛乳のコードを入力し「コードで追加」を押す。", "牛乳＋食パンのセットから「セットでかごに追加」を押す。", "かごで、牛乳と食パンの両方に10%の割引が付くことを確認する。"],
    note: "この組み合わせを試す間は、牛乳のタイムセールを受け取らずに比較してください。" },
  { title: "牛乳のタイムセール", kind: "タイムセール", codes: [["成分無調整牛乳 1L", "2900000000049"]],
    steps: ["「いまだけのお得」の牛乳タイムセールを探す。", "牛乳を先にスキャンした場合は「かごの商品をセール価格にする」を押す。", "まだかごにない場合は「セール価格でかごに追加」。牛乳の全数量が20%OFFになる。"],
    note: "タイムセールは商品と有効期間の条件で適用されます。商品を追加しただけでは割引は付きません。" },
  { title: "唐揚げのタイムセール", kind: "タイムセール", codes: [["若鶏の唐揚げ 100g", "PLU-2002"]],
    steps: ["「いまだけのお得」の唐揚げタイムセールを探す。", "「セール価格でかごに追加」を押す。", "かごの唐揚げに20%の割引が付き、数量を増やしても全数量が対象になる。"],
    note: "コードなしの惣菜も試せます。PLU-2002は商品コード欄から手入力できます。" },
];

export default function DemoOffersPage() {
  return <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950">
    <div className="mx-auto grid max-w-xl gap-5">
      <header className="rounded-3xl bg-slate-950 p-6 text-white">
        <p className="text-xs font-bold tracking-widest text-emerald-300">KAGO / DEMO</p>
        <h1 className="mt-2 text-2xl font-black">セット割・タイムセールの試し方</h1>
        <p className="mt-3 text-sm leading-6">対象は「広島デモ店」です。当日のデモ施策が有効な状態で、1つずつ試してください。</p>
        <Link href="/App?store=0da7a001-0000-4000-8000-000000000001" className="mt-4 block min-h-11 rounded-xl bg-emerald-400 p-3 text-center font-bold text-slate-950">広島デモ店で試す</Link>
        <Link href="/App/demo-barcodes" className="mt-2 block py-3 text-center text-sm underline">印刷・読み取り用のバーコードを開く</Link>
      </header>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">セット割は「商品2つ」、タイムセールは「対象商品＋有効期間」が条件です。表示されない場合は店舗・期間・受け取り済みかを確認してください。</p>
      {examples.map(example => <section key={example.title} aria-label={example.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black text-emerald-700">{example.kind}</p>
        <h2 className="mt-1 text-xl font-black">{example.title}</h2>
        <dl className="mt-4 grid gap-3">{example.codes.map(([name, code]) => <div key={code} className="rounded-xl bg-slate-100 p-3"><dt className="text-sm font-bold">{name}</dt><dd><code className="select-all break-all text-lg font-bold">{code}</code></dd></div>)}</dl>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6">{example.steps.map(step => <li key={step}>{step}</li>)}</ol>
        <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">{example.note}</p>
      </section>)}
      <p className="text-sm leading-6 text-slate-600">同じ商品に複数の割引を受け取った場合は、最も大きい割引1つが適用されます。比較には新しい来店・空のかごを使ってください。単価・合計は店舗の現在の価格で計算されます。</p>
      <Link href="/App" className="min-h-11 py-3 text-center font-bold text-emerald-800 underline">買い物画面へ戻る</Link>
    </div>
  </main>;
}
