import products from "@/data/demo/products.json";

export type Product = {
  code: string;
  name: string;
  price: number;
  category: string;
};

export const DEMO_PRODUCT_LIST = products satisfies Product[];

export const DEMO_PRODUCTS: Record<string, Product> = Object.fromEntries(
  DEMO_PRODUCT_LIST.map((product) => [product.code, product]),
);

export const MENU_ONLY_PRODUCTS: Product[] = [
  { code: "PLU-1001", name: "玉ねぎ 1個", price: 78, category: "青果" },
  { code: "PLU-1002", name: "国産りんご 1個", price: 158, category: "青果" },
  { code: "PLU-1003", name: "アボカド 1個", price: 198, category: "青果" },
  { code: "PLU-2001", name: "お店のコロッケ 1個", price: 98, category: "惣菜" },
  { code: "PLU-2002", name: "若鶏の唐揚げ 100g", price: 218, category: "惣菜" },
  { code: "PLU-3001", name: "焼きたて塩パン 1個", price: 130, category: "パン" },
];

export const SHOP_PRODUCT_LIST: Product[] = [
  ...MENU_ONLY_PRODUCTS,
  ...DEMO_PRODUCT_LIST,
];
