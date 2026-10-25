"""ADS-05 デモ広告素材と対応表を生成する。

使い方（kago-os/kago-ads で）:
    pnpm generate:ad-assets     （= python3 scripts/ad-assets/generate.py）

出力:
    public/ad-assets/*.png          広告画像（Signage 1920x1080 / App 800x800）
    public/ad-assets/*.mp4          動画広告（Signage のみ）
    src/data/demo/ad-assets.csv     広告素材と商品の対応表
    src/data/demo/products.csv      デモ商品一覧（kago-app の既存商品＋DATA-01 で追加する P-SAUCE）
    scripts/ad-assets/preview/      重ね表示の確認ページ（git に入れない）

必要なもの: google-chrome（SVG を PNG に書き出す）、ffmpeg（動画）
素材の内容（商品・メーカー・素材の版・文言・色）はこのファイルの PRODUCTS / MAKERS / CREATIVES / VERSIONS と描画関数が正本。
名前と値は hs_2604/docs/specs/common-spec.md（共通仕様書）に合わせる。
"""
import csv
import os
import shutil
import subprocess
import tempfile
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(os.path.dirname(HERE))  # kago-os/kago-ads
IMG_DIR = os.path.join(APP_ROOT, "public", "ad-assets")
DATA_DIR = os.path.join(APP_ROOT, "src", "data", "demo")
PREVIEW_DIR = os.path.join(HERE, "preview")
CHROME = shutil.which("google-chrome") or shutil.which("chromium") or "google-chrome"
FONT = "'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans','Meiryo',sans-serif"
DISCLAIMER = "※デモ用の架空ブランドです。実在の企業・商品とは関係ありません"

SIGNAGE = (1920, 1080)
APP = (800, 800)

# 画面側で重ねる領域（x, y, w, h）。メーカー広告の画像ではここに文字や絵を置かない
ZONES = {
    "signage": {"label": (40, 40, 640, 72), "price": (1360, 800, 520, 240)},
    "app": {"label": (24, 24, 400, 52), "price": (496, 664, 280, 112)},
}
# 店舗販促テンプレートで画面側が重ねる領域
PROMO_ZONES = {
    "signage": {"name": (120, 380, 1100, 200), "message": (120, 600, 1100, 120), "price": (1360, 800, 520, 240)},
    "app": {"name": (40, 250, 720, 140), "message": (40, 400, 720, 90), "price": (496, 664, 280, 112)},
}

# ---------------------------------------------------------------- データ
# デモ商品（共通仕様書 4.2・11.1）。kago-app の src/data/demo/products.json と src/lib/products.ts の既存商品に、
# DATA-01 で追加する架空商品 P-SAUCE を足したもの。価格は kago-app の表示価格（店舗別価格は DB-02 の store_products）
PRODUCTS = [
    # code, 商品名, カテゴリ, 価格, 出どころ, デモでの使い方
    ("2900000000018", "KAGO 緑茶 500ml", "飲料", 138, "kago-app", "通常推薦の例（P-TEA）"),
    ("2900000000025", "KAGO 天然水 550ml", "飲料", 98, "kago-app", ""),
    ("2900000000032", "KAGO カフェラテ", "飲料", 178, "kago-app", ""),
    ("2900000000049", "成分無調整牛乳 1L", "乳製品", 238, "kago-app", "再購入の通常推薦（P-MILK）"),
    ("2900000000056", "もっちり食パン 6枚切", "パン", 228, "kago-app", ""),
    ("2900000000063", "新鮮たまご 10個", "卵", 298, "kago-app", ""),
    ("2900000000070", "プレーンヨーグルト", "乳製品", 188, "kago-app", ""),
    ("2900000000087", "フィリピン産バナナ", "青果", 198, "kago-app", ""),
    ("2900000000094", "中辛ビーフカレー", "加工食品", 258, "kago-app", ""),
    ("2900000000100", "スパゲッティ 500g", "乾麺", 248, "kago-app", "デモでスキャンする商品（P-PASTA）"),
    ("2900000000117", "うすしおポテトチップス", "菓子", 178, "kago-app", ""),
    ("2900000000124", "ミルクチョコレート", "菓子", 158, "kago-app", ""),
    ("2900000000131", "箱ティッシュ 5個組", "日用品", 398, "kago-app", ""),
    ("2900000000148", "液体洗濯洗剤 詰替", "日用品", 498, "kago-app", ""),
    ("2900000000155", "不織布マスク 30枚", "衛生用品", 598, "kago-app", ""),
    ("2900000000162", "トマトパスタソース", "調味料", 298, "DATA-01で追加（共通仕様書 Q-08）", "メーカー広告の対象（P-SAUCE）"),
    ("PLU-1001", "玉ねぎ 1個", "青果", 78, "kago-app", "通常推薦の例（P-ONION）"),
    ("PLU-1002", "国産りんご 1個", "青果", 158, "kago-app", ""),
    ("PLU-1003", "アボカド 1個", "青果", 198, "kago-app", ""),
    ("PLU-2001", "お店のコロッケ 1個", "惣菜", 98, "kago-app", "店舗販促の例（P-CROQ）"),
    ("PLU-2002", "若鶏の唐揚げ 100g", "惣菜", 218, "kago-app", ""),
    ("PLU-3001", "焼きたて塩パン 1個", "パン", 130, "kago-app", ""),
]

# 架空メーカー（共通仕様書 11.1 の M1。is_fictional = true）
MAKERS = {"M1": {"display_name": "瀬戸内トマト食品", "slug": "setouchi-tomato-foods"}}

# 広告素材 creatives（共通仕様書 5：id・maker_id・product_id）
CREATIVES = {"CR1": {"maker_id": "M1", "product_code": "2900000000162"}}

# 素材の版 creative_versions。媒体ごとに素材を持つ（Signage は画像か動画のどちらか）
# 第1版を却下 → 第2版で再申請 → 承認、という共通仕様書 11.2 の流れに合わせる
VERSIONS = [
    {"creative_id": "CR1", "version": 1, "headline": "ゆでたパスタに、かけるだけ。", "note": "初版",
     "channels": {"app": "png", "signage": "png"}},
    {"creative_id": "CR1", "version": 2, "headline": "ゆでたパスタに、かけるだけ。", "note": "商品名を大きくし、Signage を10秒の動画にした",
     "channels": {"app": "png", "signage": "mp4"}},
]

PRODUCT_BY_CODE = {p[0]: p for p in PRODUCTS}


# ---------------------------------------------------------------- SVG 部品
def t(x, y, s, size, color="#1f2328", weight=400, anchor="start", ls=0):
    return (
        f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" '
        f'text-anchor="{anchor}" letter-spacing="{ls}" dominant-baseline="alphabetic">{escape(s)}</text>'
    )


def svg(w, h, body, bg):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
        f'font-family="{FONT}"><rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>'
    )


def zone_guides(media, zones, show):
    """確認用：重ねる領域を点線で描く（show=False なら何も描かない）"""
    if not show:
        return ""
    out = []
    for name, (x, y, w, h) in zones[media].items():
        out.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#ff00aa" '
            f'stroke-width="3" stroke-dasharray="12 8"/>'
        )
        out.append(t(x + 8, y + 28, name, 22, "#ff00aa", 700))
    return "".join(out)


# ---- イラスト（写真は使わない）
def ill_pasta(cx, cy, r, sauce=True):
    """お皿のパスタ"""
    s = [f'<ellipse cx="{cx}" cy="{cy + r * 0.08}" rx="{r * 1.08}" ry="{r * 0.36}" fill="#00000014"/>',
         f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r * 0.34}" fill="#ffffff" stroke="#e6ddd0" stroke-width="{r * 0.03}"/>',
         f'<ellipse cx="{cx}" cy="{cy - r * 0.04}" rx="{r * 0.7}" ry="{r * 0.22}" fill="#f2e3c6"/>']
    for i in range(7):
        dy = -r * 0.16 + i * r * 0.045
        s.append(
            f'<path d="M {cx - r * 0.55} {cy + dy} q {r * 0.14} {-r * 0.08} {r * 0.28} 0 t {r * 0.28} 0 t {r * 0.28} 0 t {r * 0.28} 0" '
            f'fill="none" stroke="#e8b84a" stroke-width="{r * 0.035}" stroke-linecap="round"/>'
        )
    if sauce:
        s.append(f'<ellipse cx="{cx + r * 0.05}" cy="{cy - r * 0.1}" rx="{r * 0.36}" ry="{r * 0.12}" fill="#d7332b"/>')
        s.append(f'<circle cx="{cx - r * 0.1}" cy="{cy - r * 0.14}" r="{r * 0.04}" fill="#3c8d2f"/>')
        s.append(f'<circle cx="{cx + r * 0.18}" cy="{cy - r * 0.09}" r="{r * 0.035}" fill="#3c8d2f"/>')
    return "".join(s)


def ill_tomato(cx, cy, r):
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#e2412f"/>'
        f'<ellipse cx="{cx - r * 0.35}" cy="{cy - r * 0.35}" rx="{r * 0.22}" ry="{r * 0.14}" fill="#ffffff55"/>'
        f'<path d="M {cx} {cy - r * 0.95} l {r * 0.25} {-r * 0.2} M {cx} {cy - r * 0.9} l {-r * 0.35} {-r * 0.05} '
        f'M {cx} {cy - r * 0.9} l {r * 0.38} {r * 0.02} M {cx} {cy - r * 0.9} l {-r * 0.12} {-r * 0.3}" '
        f'stroke="#3c8d2f" stroke-width="{r * 0.12}" stroke-linecap="round"/>'
    )


def ill_jar(cx, cy, h, color, label):
    """ソースの瓶"""
    w = h * 0.62
    return (
        f'<rect x="{cx - w / 2}" y="{cy - h / 2}" width="{w}" height="{h}" rx="{w * 0.18}" fill="{color}"/>'
        f'<rect x="{cx - w * 0.42}" y="{cy - h / 2 - h * 0.12}" width="{w * 0.84}" height="{h * 0.14}" rx="{w * 0.06}" fill="#5b4636"/>'
        f'<rect x="{cx - w * 0.4}" y="{cy - h * 0.12}" width="{w * 0.8}" height="{h * 0.34}" rx="{w * 0.06}" fill="#fff8ec"/>'
        + t(cx, cy + h * 0.09, label, h * 0.1, "#7a2a1f", 700, "middle")
    )


def ill_shaker(cx, cy, h):
    """粉チーズの容器"""
    w = h * 0.5
    dots = "".join(
        f'<circle cx="{cx - w * 0.3 + (i % 5) * w * 0.15}" cy="{cy + h * 0.62 + (i // 5) * h * 0.08}" r="{h * 0.018}" fill="#f6d77a"/>'
        for i in range(15)
    )
    return (
        f'<rect x="{cx - w / 2}" y="{cy - h / 2}" width="{w}" height="{h}" rx="{w * 0.12}" fill="#2f7a3b"/>'
        f'<rect x="{cx - w / 2}" y="{cy - h / 2 - h * 0.12}" width="{w}" height="{h * 0.16}" rx="{w * 0.08}" fill="#f2c94c"/>'
        f'<rect x="{cx - w * 0.38}" y="{cy - h * 0.15}" width="{w * 0.76}" height="{h * 0.36}" rx="{w * 0.06}" fill="#fffbea"/>'
        + t(cx, cy + h * 0.07, "粉チーズ", h * 0.085, "#2f7a3b", 700, "middle")
        + dots
    )


def ill_milk(cx, cy, h):
    """牛乳パックとコップ"""
    w = h * 0.5
    return (
        f'<path d="M {cx - w / 2} {cy - h * 0.3} L {cx} {cy - h * 0.5} L {cx + w / 2} {cy - h * 0.3} '
        f'L {cx + w / 2} {cy + h / 2} L {cx - w / 2} {cy + h / 2} Z" fill="#ffffff" stroke="#c9dceb" stroke-width="{h * 0.012}"/>'
        f'<rect x="{cx - w / 2}" y="{cy - h * 0.05}" width="{w}" height="{h * 0.3}" fill="#2b6cb0"/>'
        + t(cx, cy + h * 0.15, "牛乳", h * 0.12, "#ffffff", 700, "middle")
        + f'<path d="M {cx + w * 0.75} {cy + h * 0.05} L {cx + w * 1.45} {cy + h * 0.05} L {cx + w * 1.35} {cy + h / 2} '
        f'L {cx + w * 0.85} {cy + h / 2} Z" fill="#ffffff" stroke="#c9dceb" stroke-width="{h * 0.012}"/>'
        f'<path d="M {cx + w * 0.79} {cy + h * 0.18} L {cx + w * 1.41} {cy + h * 0.18} L {cx + w * 1.35} {cy + h / 2} '
        f'L {cx + w * 0.85} {cy + h / 2} Z" fill="#f4f8fb"/>'
    )


def ill_toast(cx, cy, s):
    return (
        f'<path d="M {cx - s} {cy + s * 0.8} L {cx - s} {cy - s * 0.2} q 0 {-s * 0.75} {s} {-s * 0.75} '
        f'q {s} 0 {s} {s * 0.75} L {cx + s} {cy + s * 0.8} Z" fill="#c98a3c"/>'
        f'<path d="M {cx - s * 0.82} {cy + s * 0.65} L {cx - s * 0.82} {cy - s * 0.15} q 0 {-s * 0.6} {s * 0.82} {-s * 0.6} '
        f'q {s * 0.82} 0 {s * 0.82} {s * 0.6} L {cx + s * 0.82} {cy + s * 0.65} Z" fill="#f6dfb4"/>'
    )


def ill_bottle(cx, cy, h):
    """洗剤のつめかえパックと泡"""
    w = h * 0.55
    bubbles = "".join(
        f'<circle cx="{cx + dx * h}" cy="{cy + dy * h}" r="{rr * h}" fill="#ffffff" stroke="#9fd8c6" stroke-width="{h * 0.01}"/>'
        for dx, dy, rr in [(-0.5, -0.35, 0.07), (-0.62, -0.1, 0.045), (0.48, -0.4, 0.06), (0.58, -0.15, 0.04), (0.42, 0.1, 0.03)]
    )
    return (
        bubbles
        + f'<path d="M {cx - w / 2} {cy - h * 0.35} q {w / 2} {-h * 0.12} {w} 0 L {cx + w / 2} {cy + h * 0.45} '
        f'q {-w / 2} {h * 0.08} {-w} 0 Z" fill="#1f8a70"/>'
        f'<rect x="{cx + w * 0.12}" y="{cy - h * 0.5}" width="{w * 0.22}" height="{h * 0.14}" rx="{w * 0.04}" fill="#f2c94c"/>'
        f'<rect x="{cx - w * 0.38}" y="{cy - h * 0.1}" width="{w * 0.76}" height="{h * 0.3}" rx="{w * 0.06}" fill="#ffffff"/>'
        + t(cx, cy + h * 0.08, "つめかえ", h * 0.075, "#1f8a70", 700, "middle")
    )


# ---------------------------------------------------------------- 広告テンプレート
THEME = {"bg": "#fff4e6", "band": "#ffe2c2", "ink": "#7a2a1f", "accent": "#d7332b"}
SUB = "瀬戸内のトマトを、じっくり煮込みました"


def sauce_illustration(x, y, s):
    return (ill_pasta(x - s * 0.15, y + s * 0.35, s * 1.05)
            + ill_jar(x + s * 0.75, y - s * 0.35, s * 0.9, "#d7332b", "瀬戸内")
            + ill_tomato(x + s * 0.2, y - s * 0.75, s * 0.22))


def version_svg(v, channel, guides=False):
    """素材の版の静止画。第2版は商品名を大きくする（第1版の却下理由への対応）"""
    cr = CREATIVES[v["creative_id"]]
    product = PRODUCT_BY_CODE[cr["product_code"]][1]
    maker = MAKERS[cr["maker_id"]]["display_name"]
    catch = ["ゆでたパスタに、", "かけるだけ。"]
    big = v["version"] >= 2
    if channel == "signage":
        w, h = SIGNAGE
        body = [
            f'<rect x="0" y="{h - 260}" width="{w}" height="260" fill="{THEME["band"]}"/>',
            t(120, 300, catch[0], 92, THEME["ink"], 800),
            t(120, 410, catch[1], 92, THEME["ink"], 800),
            t(124, 510, SUB, 44, THEME["accent"], 700),
            t(124, 700 if big else 690, product, 84 if big else 60, "#1f2328", 800),
            t(124, 770, maker, 36, "#57606a", 500),
            sauce_illustration(1450, 470, 300),
            t(40, h - 30, DISCLAIMER, 22, "#57606a"),
        ]
    else:
        w, h = APP
        body = [
            f'<rect x="0" y="{h - 170}" width="{w}" height="170" fill="{THEME["band"]}"/>',
            t(40, 140, catch[0], 52, THEME["ink"], 800),
            t(40, 208, catch[1], 52, THEME["ink"], 800),
            sauce_illustration(400, 430, 150),
            t(40, 694 if big else 690, product, 40 if big else 34, "#1f2328", 800),
            t(40, 738, maker, 22, "#57606a", 500),
            t(24, h - 14, DISCLAIMER, 13, "#57606a"),
        ]
    return svg(w, h, "".join(body) + zone_guides(channel, ZONES, guides), THEME["bg"])


def video_scenes(v):
    """Signage 動画の3場面。label・price の領域は全場面で空ける"""
    w, h = SIGNAGE
    common = f'<rect x="0" y="{h - 260}" width="{w}" height="260" fill="{THEME["band"]}"/>' + t(40, h - 30, DISCLAIMER, 22, "#57606a")
    s1 = common + t(120, 420, "スパゲッティを選んだら、", 100, THEME["ink"], 800) + ill_pasta(1380, 560, 340, sauce=False)
    s2 = common + t(120, 420, "瀬戸内のトマトで、", 100, THEME["ink"], 800) + ill_tomato(1300, 420, 150) + ill_jar(1600, 440, 320, "#d7332b", "瀬戸内")
    s3 = version_svg(v, "signage")
    return [svg(w, h, s1, THEME["bg"]), svg(w, h, s2, THEME["bg"]), s3]


def fallback_svg(guides=False):
    """Signage の案内（再生記録の mode = fallback。広告0件・通信断で素材の期限切れのとき。広告ではないので集計しない）"""
    w, h = SIGNAGE
    body = (
        f'<rect x="0" y="0" width="{w}" height="{h}" fill="#14213d"/>'
        f'<circle cx="1540" cy="420" r="300" fill="#1f3a68"/>'
        f'<rect x="1400" y="210" width="280" height="460" rx="40" fill="#ffffff"/>'
        f'<rect x="1424" y="260" width="232" height="340" rx="12" fill="#e8eef8"/>'
        f'<rect x="1470" y="330" width="140" height="140" fill="none" stroke="#14213d" stroke-width="10"/>'
        f'<line x1="1450" y1="400" x2="1630" y2="400" stroke="#e2412f" stroke-width="8"/>'
        + t(120, 330, "スマホでスキャンして、", 96, "#ffffff", 800)
        + t(120, 450, "そのままお会計。", 96, "#ffffff", 800)
        + t(124, 580, "KAGO App で、レジに並ばずお買い物", 46, "#f2c94c", 700)
        + t(124, 680, "入口の案内からアプリを開いてください", 36, "#c9d4e8", 500)
        + t(124, h - 120, "KAGO/OS", 64, "#ffffff", 800, ls=4)
    )
    return svg(w, h, body + zone_guides("signage", ZONES, guides), "#14213d")


def promo_template_svg(channel, guides=False):
    """店舗販促テンプレート。商品名・理由文・価格は画面側（SIG-01・APP-06）が重ねる"""
    if channel == "signage":
        w, h = SIGNAGE
        body = (
            f'<rect x="0" y="0" width="{w}" height="{h}" fill="#fffaf0"/>'
            f'<rect x="0" y="0" width="{w}" height="220" fill="#c0392b"/>'
            + t(120, 150, "店舗からのおすすめ", 96, "#ffffff", 800, ls=6)
            + f'<rect x="60" y="300" width="{w - 120}" height="{h - 360}" rx="36" fill="none" stroke="#e8c9a0" stroke-width="6" stroke-dasharray="2 18" stroke-linecap="round"/>'
        )
    else:
        w, h = APP
        body = (
            f'<rect x="0" y="0" width="{w}" height="{h}" fill="#fffaf0"/>'
            f'<rect x="0" y="0" width="{w}" height="170" fill="#c0392b"/>'
            + t(40, 112, "店舗からのおすすめ", 60, "#ffffff", 800, ls=2)
            + f'<rect x="20" y="210" width="{w - 40}" height="{h - 230}" rx="24" fill="none" stroke="#e8c9a0" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round"/>'
        )
    return svg(w, h, body + zone_guides(channel, PROMO_ZONES, guides), "#fffaf0")


# ---------------------------------------------------------------- 書き出し
def render_png(svg_text, size, out_path):
    # headless Chrome は表示領域がウィンドウより少し低くなるため、高めに撮ってから切り抜く
    from PIL import Image

    w, h = size
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "in.svg")
        shot = os.path.join(d, "shot.png")
        with open(src, "w", encoding="utf8") as f:
            f.write(svg_text)
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
             f"--window-size={w},{h + 300}", f"--screenshot={shot}", "file://" + src],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120,
        )
        Image.open(shot).convert("RGB").crop((0, 0, w, h)).save(out_path, optimize=True)


def render_video(scenes, out_path, scene_sec=3.8, fade=0.6, total=10):
    with tempfile.TemporaryDirectory() as d:
        frames = []
        for i, s in enumerate(scenes):
            p = os.path.join(d, f"s{i}.png")
            render_png(s, SIGNAGE, p)
            frames.append(p)
        # 古い ffmpeg（xfade なし）でも動くよう、次の場面を遅らせてフェードインで重ねる
        starts = [round(i * (scene_sec - fade), 2) for i in range(len(frames))]
        args = ["ffmpeg", "-y", "-loglevel", "error"]
        for p, st in zip(frames, starts):
            args += ["-framerate", "30", "-loop", "1", "-t", str(round(total - st, 2)), "-i", p]
        parts = ["[0]format=yuva420p[b0]"]
        prev = "b0"
        for i in range(1, len(frames)):
            parts.append(f"[{i}]format=yuva420p,fade=in:st=0:d={fade}:alpha=1,setpts=PTS-STARTPTS+{starts[i]}/TB[f{i}]")
            parts.append(f"[{prev}][f{i}]overlay=eof_action=pass[o{i}]")
            prev = f"o{i}"
        parts[-1] = parts[-1].replace(f"[o{len(frames) - 1}]", ",format=yuv420p[v]")
        args += ["-filter_complex", ";".join(parts), "-map", "[v]", "-r", "30", "-c:v", "libx264", "-crf", "20",
                 "-movflags", "+faststart", "-t", str(total), out_path]
        subprocess.run(args, check=True)


# 確認用の価格は PRODUCTS の価格（kago-app の表示価格）。実際は DB-02 の店舗別価格
PREVIEW_PROMO = {"code": "PLU-2001", "reason": "店内で揚げたてです"}  # 共通仕様書 11.2 の SP1


def pct(zone, size):
    x, y, w, h = zone
    W, H = size
    return f"left:{x / W * 100:.3f}%;top:{y / H * 100:.3f}%;width:{w / W * 100:.3f}%;height:{h / H * 100:.3f}%"


def write_preview(rows):
    """画面側の重ね表示（広告表記・価格・店舗販促の文字）を再現した確認ページ"""
    cards = []
    for r in rows:
        media = r["channel"]
        size = SIGNAGE if media == "signage" else APP
        src = "../../../public/" + r["file"]
        media_tag = (f'<video src="{src}" autoplay muted loop playsinline></video>' if r["format"] == "mp4"
                     else f'<img src="{src}" alt="{escape(r["asset_id"])}">')
        over = ""
        if r["kind"] == "sponsored":
            z = ZONES[media]
            price = PRODUCT_BY_CODE[r["product_code"]][3]
            over = (f'<div class="ov label" style="{pct(z["label"], size)}"><span>広告｜提供：{escape(r["maker_name"])}</span></div>'
                    f'<div class="ov price" style="{pct(z["price"], size)}"><span>¥{price}<small>（税込）</small></span></div>')
        elif r["kind"] == "store_promo_template":
            z = PROMO_ZONES[media]
            promo = PRODUCT_BY_CODE[PREVIEW_PROMO["code"]]
            over = (f'<div class="ov name" style="{pct(z["name"], size)}"><span>{escape(promo[1])}</span></div>'
                    f'<div class="ov msg" style="{pct(z["message"], size)}"><span>{escape(PREVIEW_PROMO["reason"])}</span></div>'
                    f'<div class="ov price" style="{pct(z["price"], size)}"><span>¥{promo[3]}<small>（税込）</small></span></div>')
        cards.append(
            f'<figure class="{media}"><div class="frame" style="aspect-ratio:{size[0]}/{size[1]}">{media_tag}{over}</div>'
            f'<figcaption><b>{escape(r["asset_id"])}</b> {escape(r["product_name"] or r["kind"])}</figcaption></figure>'
        )
    html = f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>広告素材の確認</title>
<style>
body{{margin:0;padding:24px;background:#f6f8fa;color:#1f2328;font-family:{FONT}}}
h1{{font-size:20px;margin:0 0 4px}} p{{margin:0 0 16px;color:#57606a;font-size:13px}}
.grid{{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}}
figure{{margin:0;background:#fff;padding:10px;border-radius:8px;box-shadow:0 1px 3px #0002}}
figure.signage .frame{{width:640px}} figure.app .frame{{width:300px}}
.frame{{position:relative;overflow:hidden;container-type:inline-size}}
.frame img,.frame video{{display:block;width:100%;height:100%;object-fit:contain}}
figcaption{{font-size:12px;margin-top:6px;color:#57606a}}
.ov{{position:absolute;display:flex;align-items:center;box-sizing:border-box;white-space:nowrap}}
.label span{{background:#1f2328cc;color:#fff;font-size:2.1cqw;padding:.4cqw 1.2cqw;border-radius:.6cqw}}
.app .label span{{font-size:3.6cqw}}
.price{{justify-content:flex-end}} .price span{{background:#fff;color:#c0392b;font-weight:800;font-size:6.5cqw;padding:.6cqw 1.8cqw;border-radius:1cqw;box-shadow:0 .3cqw 1cqw #0003}}
.app .price span{{font-size:9cqw}} .price small{{font-size:40%;color:#57606a;font-weight:500}}
.name span{{font-size:6cqw;font-weight:800}} .app .name span{{font-size:10cqw}}
.msg span{{font-size:3cqw;color:#c0392b;font-weight:700}} .app .msg span{{font-size:5.5cqw}}
</style></head><body>
<h1>広告素材の確認（ADS-05）</h1>
<p>広告表記・提供元・価格・店舗販促の文字は、画面側（SIG-01・APP-06）が重ねる想定で再現している。価格は kago-app の表示価格（実際は DB-02 の店舗別価格）。</p>
<div class="grid">{''.join(cards)}</div></body></html>"""
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    with open(os.path.join(PREVIEW_DIR, "index.html"), "w", encoding="utf8") as f:
        f.write(html)


def main():
    # 古い素材が残らないよう、生成物はいったん消してから作る
    # Keep separately versioned design collections and previously issued files.
    os.makedirs(IMG_DIR, exist_ok=True)
    rows = []
    blank = {"creative_id": "", "creative_version": "", "product_code": "", "product_name": "", "category": "",
             "maker_id": "", "maker_name": "", "headline": "", "duration_sec": ""}

    for v in VERSIONS:
        cr = CREATIVES[v["creative_id"]]
        product = PRODUCT_BY_CODE[cr["product_code"]]
        for channel, ext in v["channels"].items():
            size = SIGNAGE if channel == "signage" else APP
            fname = f'{v["creative_id"]}_v{v["version"]}_{channel}.{ext}'
            out = os.path.join(IMG_DIR, fname)
            if ext == "mp4":
                render_video(video_scenes(v), out)
            else:
                render_png(version_svg(v, channel), size, out)
            rows.append({
                "asset_id": f'{v["creative_id"]}-v{v["version"]}-{channel}',
                "kind": "sponsored",
                "creative_id": v["creative_id"],
                "creative_version": v["version"],
                "product_code": product[0],
                "product_name": product[1],
                "category": product[2],
                "maker_id": cr["maker_id"],
                "maker_name": MAKERS[cr["maker_id"]]["display_name"],
                "headline": v["headline"],
                "channel": channel,
                "format": ext,
                "width": size[0],
                "height": size[1],
                "duration_sec": 10 if ext == "mp4" else "",
                "file": f"ad-assets/{fname}",
                "status": "未申請（ADS-03で申請し、INS-01で承認されるまで配信しない）",
            })

    render_png(fallback_svg(), SIGNAGE, os.path.join(IMG_DIR, "FALLBACK_v1_signage.png"))
    rows.append({**blank, "asset_id": "FALLBACK-v1-signage", "kind": "fallback", "creative_version": 1,
                 "channel": "signage", "format": "png", "width": SIGNAGE[0], "height": SIGNAGE[1],
                 "file": "ad-assets/FALLBACK_v1_signage.png",
                 "status": "Signage の案内（再生記録の mode = fallback。承認不要・集計しない）"})
    for channel, size in (("signage", SIGNAGE), ("app", APP)):
        fname = f"PROMO_TEMPLATE_v1_{channel}.png"
        render_png(promo_template_svg(channel), size, os.path.join(IMG_DIR, fname))
        rows.append({**blank, "asset_id": f"PROMO-TEMPLATE-v1-{channel}", "kind": "store_promo_template", "creative_version": 1,
                     "channel": channel, "format": "png", "width": size[0], "height": size[1], "file": f"ad-assets/{fname}",
                     "status": "店舗販促の背景（商品名・理由文・価格は画面側で重ねる。承認不要）"})

    fields = ["asset_id", "kind", "creative_id", "creative_version", "product_code", "product_name", "category",
              "maker_id", "maker_name", "headline", "channel", "format", "width", "height", "duration_sec", "file", "status"]
    with open(os.path.join(DATA_DIR, "ad-assets.csv"), "w", encoding="utf8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=fields)
        wr.writeheader()
        wr.writerows(rows)
    with open(os.path.join(DATA_DIR, "products.csv"), "w", encoding="utf8", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["code", "name", "category", "price", "source", "demo_use"])
        wr.writerows(PRODUCTS)
    import json
    with open(os.path.join(DATA_DIR, "ad-assets.json"), "w", encoding="utf8") as f:
        json.dump([{k: str(v) for k, v in row.items()} for row in rows], f, ensure_ascii=False, indent=2)
        f.write("\n")
    write_preview(rows)
    print(f"{len(rows)} assets written")


if __name__ == "__main__":
    main()
