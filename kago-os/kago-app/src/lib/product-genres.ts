// 「商品から選ぶ」のジャンル（#144）。いまは野菜・肉・魚の3つだけを表示し、それ以外の商品は一覧に出さない
// （バーコード・商品コードでは従来どおり追加できる）。ジャンルは商品マスタのcategoryで決める。
// DATA-01の青果のうち野菜にあたる既存商品（玉ねぎ・アボカド・生バジル）は、既存データを変えずにコードで含める。
import type { StoreProduct } from "@/features/cart/contracts";

export const PRODUCT_GENRES = [
  { id: "vegetable", label: "野菜", icon: "🥬", categories: ["野菜"], codes: ["PLU-1001", "PLU-1003", "2900000000179"] },
  { id: "meat", label: "肉", icon: "🥩", categories: ["肉"], codes: [] },
  { id: "fish", label: "魚", icon: "🐟", categories: ["魚"], codes: [] },
] as const;
export type ProductGenreId = (typeof PRODUCT_GENRES)[number]["id"];

export function productGenre(product: Pick<StoreProduct, "code" | "category">): ProductGenreId | null {
  const genre = PRODUCT_GENRES.find(g => (g.categories as readonly string[]).includes(product.category) || (g.codes as readonly string[]).includes(product.code));
  return genre?.id ?? null;
}

/** Products of one genre, in the store's order (name, then id — as app_list_products returns them). */
export function productsInGenre<T extends Pick<StoreProduct, "code" | "category">>(products: T[], genre: ProductGenreId): T[] {
  return products.filter(product => productGenre(product) === genre);
}
