"""#196: photograph-led new ad versions. Reuse unchanged App images; no network/DB."""
import base64,csv,hashlib,json
from pathlib import Path
from html import escape
from generate import render_png,svg,t
ROOT=Path(__file__).resolve().parents[2]
APP=ROOT.parent/"kago-app"
OUT=ROOT/"public/ad-assets/design-v2"
SOURCES={
 "sauce":APP/"public/images/products/catalog-v1/tomato-sauce.webp",
 "bread":APP/"public/images/products/catalog-v1/bread.webp",
 "basket":APP/"public/images/shopping/store-recommendation-v2/c-basket.webp"
}
def photo(key,x,y,w,h):
 uri="data:image/webp;base64,"+base64.b64encode(SOURCES[key].read_bytes()).decode()
 return f'<image href="{uri}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>'
def campaign(maker,version,channel):
 app=channel=="app";w,h=(800,800) if app else (1920,1080)
 tomato=maker=="M1";ink="#72382d" if tomato else "#14384f";accent="#b23d30" if tomato else "#07576b"
 bg="#fff8ef" if tomato else "#eff5f7";name="瀬戸内トマト食品" if tomato else "確認用メーカー（架空）"
 brand="SETOUCHI  /  TOMATO FOODS" if tomato else "DAILY TABLE  /  BAKERY COLLECTION"
 product="トマトパスタソース" if tomato else "もっちり食パン"
 lines=(["ひとさじで、","食卓が変わる。"] if version==3 else ["いつもの夜に、","トマトのごちそう。"]) if tomato else (["朝のひと息に、","ふんわり一枚。"] if version==1 else ["いつもの朝を、","ちょっと豊かに。"])
 body=[f'<rect x="0" y="0" width="{"10" if app else "18"}" height="{h}" fill="{accent}"/>']
 if not tomato:body.append(f'<rect x="18" y="18" width="{w-36}" height="{h-36}" rx="8" fill="none" stroke="#d0dfe4" stroke-width="2"/>')
 if app:
  body += [t(44,112,brand,15,accent,700,ls=1.6),t(44,151,name,19,ink,500),
   f'<g font-family="{"Noto Serif CJK JP,serif" if tomato else "Noto Sans CJK JP,sans-serif"}">'+t(40,222,lines[0],52,ink,700)+t(40,286,lines[1],52,ink,700)+'</g>',
   t(44,334,"いつもの食卓に、おいしい選択。",17,accent,500),
   '<rect x="386" y="348" width="370" height="300" rx="26" fill="white"/>',
   photo("sauce" if tomato else "bread",394,354,356,290),
   f'<path d="M44 630H300" stroke="{accent}" stroke-width="2"/>',
   t(44,670,"PANTRY SELECT" if tomato else "BREAKFAST SELECT",13,accent,700,ls=2),
   t(44,711,product,31,ink,700),t(44,746,"日々のごはんを、気持ちよく。",17,ink,400),
   t(44,783,"デモ用の架空ブランド・商品です",12,"#617078")]
 else:
  body += [t(110,172,brand,24,accent,700,ls=3),t(110,218,name,30,ink,500),
   f'<g font-family="{"Noto Serif CJK JP,serif" if tomato else "Noto Sans CJK JP,sans-serif"}">'+t(102,390,lines[0],110,ink,700)+t(102,525,lines[1],110,ink,700)+'</g>',
   t(110,620,"いつもの食卓に、おいしい選択。",36,accent,500),
   '<rect x="1070" y="150" width="720" height="620" rx="42" fill="white"/>',
   photo("sauce" if tomato else "bread",1110,160,640,600),
   f'<path d="M110 810H790" stroke="{accent}" stroke-width="2"/>',
   t(110,870,"PANTRY SELECT" if tomato else "BREAKFAST SELECT",22,accent,700,ls=4),
   t(110,945,product,56,ink,700),t(110,1000,"日々のごはんを、気持ちよく。",30,ink,400),
   t(110,1050,"デモ用の架空ブランド・商品です",20,"#617078")]
 return svg(w,h,"".join(body),bg)
def promo(channel):
 app=channel=="app";w,h=(800,800) if app else (1920,1080)
 # Keep the established name/reason/price zones free of baked-in product data.
 body='<defs><linearGradient id="veil"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".65" stop-color="#fff" stop-opacity=".94"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient></defs>'
 body+=photo("basket",0,0,w,h)
 body+=f'<rect width="{w}" height="{h}" fill="url(#veil)"/>'
 body+=t(40 if app else 120,133 if app else 200,"STORE SELECTION",18 if app else 27,"#07576b",700,ls=3)
 body+=t(40 if app else 120,185 if app else 285,"お店から、今日のおすすめ。",30 if app else 56,"#0e2841",700)
 body+=f'<rect x="0" y="{h-120 if app else h-160}" width="{w}" height="{"120" if app else "160"}" fill="#edf7f4"/>'
 body+=t(40 if app else 120,h-30,"KAGO / STORE",16 if app else 24,"#07576b",700,ls=3)
 return svg(w,h,body,"#f4f8f6")
def fallback():
 body=photo("basket",940,0,980,1080)
 body+='<rect width="1010" height="1080" fill="#eef7f4"/><rect x="110" y="170" width="72" height="8" fill="#00a5a5"/>'
 body+=t(110,270,"KAGO / APP",35,"#07576b",700,ls=4)
 body+=t(103,440,"スマホでスキャン。",86,"#0e2841",700)+t(103,555,"買い物を、軽やかに。",76,"#0e2841",700)
 body+=t(110,670,"商品のバーコードを読み取って、",33,"#506777",400)+t(110,726,"そのままお会計へ。",33,"#506777",400)
 body+=t(110,960,"かごが、売り場を動かす。",32,"#07576b",700)
 return svg(1920,1080,body,"#eef7f4")
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 rows=[]
 supplied_path=OUT/"supplied.json"
 supplied=json.loads(supplied_path.read_text()) if supplied_path.exists() else {}
 for maker,versions in [("M1",[3,4]),("M2",[1,2])]:
  for version in versions:
   for channel,size in [("app",(800,800)),("signage",(1920,1080))]:
    creative="CR1" if maker=="M1" else "CR2"
    file=f"{creative}_v{version}_{channel}.png"
    imported=supplied.get(file)
    if imported:
     assert hashlib.sha256((OUT/file).read_bytes()).hexdigest()==imported["sha256"],"Supplied image changed"
     size=(imported["width"],imported["height"])
    else:render_png(campaign(maker,version,channel),size,str(OUT/file))
    rows.append(dict(asset_id=f"{creative}-v{version}-{channel}",maker_id=maker,maker_name="瀬戸内トマト食品" if maker=="M1" else "確認用メーカー（架空）",product_code="2900000000162" if maker=="M1" else "2900000000056",product_name="トマトパスタソース" if maker=="M1" else "もっちり食パン 6枚切",creative_version=version,channel=channel,kind="sponsored",file="/ad-assets/design-v2/"+file,width=size[0],height=size[1],status="未申請・デザイン確認用"))
    if imported:rows[-1].update(embedded_price=imported["embedded_price"],artwork_source="user-supplied")
 for channel,size in [("app",(800,800)),("signage",(1920,1080))]:
  file="PROMO_TEMPLATE_v2_"+channel+".png";render_png(promo(channel),size,str(OUT/file))
  rows.append(dict(asset_id="PROMO-v2-"+channel,channel=channel,kind="store_promo_template",file="/ad-assets/design-v2/"+file,width=size[0],height=size[1],status="新しい店舗販促背景・デザイン確認用"))
 render_png(fallback(),(1920,1080),str(OUT/"FALLBACK_v2_signage.png"))
 rows.append(dict(asset_id="FALLBACK-v2-signage",channel="signage",kind="fallback",file="/ad-assets/design-v2/FALLBACK_v2_signage.png",width=1920,height=1080,status="汎用案内・広告ではない"))
 dest=ROOT/"src/data/demo/ad-design-v2.json";dest.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+"\n")
 manifest={key:dict(source=str(p.relative_to(ROOT.parent)),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for key,p in SOURCES.items()}
 (OUT/"sources.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
 print(len(rows),"new assets generated; old versions unchanged")
if __name__=="__main__":main()
