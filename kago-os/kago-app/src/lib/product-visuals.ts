import { Product } from "@/lib/products";

const PRODUCT_ICONS: Record<string, string> = {
  飲料: "🥤",
  乳製品: "🥛",
  パン: "🍞",
  卵: "🥚",
  青果: "🥬",
  惣菜: "🍱",
  加工食品: "🍛",
  乾麺: "🍝",
  菓子: "🍫",
  日用品: "🧺",
  衛生用品: "🫧",
};

const PRODUCT_CODE_ICONS: Record<string, string> = {
  "2900000000018": "🍵",
  "2900000000025": "💧",
  "2900000000032": "☕",
  "2900000000049": "🥛",
  "2900000000056": "🍞",
  "2900000000063": "🥚",
  "2900000000070": "🥣",
  "2900000000087": "🍌",
  "2900000000094": "🍛",
  "2900000000100": "🍝",
  "2900000000117": "🥔",
  "2900000000124": "🍫",
  "2900000000131": "🧻",
  "2900000000148": "🧴",
  "2900000000155": "😷",
  "PLU-1001": "🧅",
  "PLU-1002": "🍎",
  "PLU-1003": "🥑",
  "PLU-2001": "🥔",
  "PLU-2002": "🍗",
  "PLU-3001": "🥐",
};

export const productIcon = (product: Product) =>
  PRODUCT_CODE_ICONS[product.code] ?? PRODUCT_ICONS[product.category] ?? "🛍️";

export const RECOMMENDATION_IMAGES: Record<string, string> = {
  "2900000000049": "/images/recommendations/milk-flyer.jpg",
  "2900000000056": "/images/recommendations/bread-flyer.jpg",
  "2900000000063": "/images/recommendations/eggs-flyer.jpg",
  "2900000000070": "/images/recommendations/yogurt-flyer.jpg",
  "2900000000087": "/images/recommendations/banana-flyer.jpg",
};

export const MENU_PRODUCT_IMAGES: Record<string, string> = {
  "PLU-1001": "/images/products/onion.png",
  "PLU-1002": "/images/products/apple.png",
  "PLU-1003": "/images/products/avocado.png",
  "PLU-2001": "/images/products/croquette.png",
  "PLU-2002": "/images/products/karaage.png",
  "PLU-3001": "/images/products/shio-pan.png",
};
